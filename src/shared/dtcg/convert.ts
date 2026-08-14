import type {
  AliasTarget,
  CollectionData,
  ExportData,
  PaintStyleData,
  StylesData,
  TextStyleData,
  VariableData,
  VariableModeValue
} from "../types";
import { rgbaToDtcgColor } from "./color";
import { nameToPath, slugify, toReference } from "./names";
import { buildResolver } from "./resolver";

export const FIGMA_EXTENSION_KEY = "io.github.figma-dtcg-design-tokens";
export const STYLES_ROOT_GROUP = "styles";
export const STYLES_FILE = "styles.tokens.json";
export const RESOLVER_FILE = "resolver.json";

export interface TokenFile {
  /** Path relative to the configured base path, e.g. "colors/light.tokens.json" */
  path: string;
  content: Record<string, unknown>;
}

export interface ConversionResult {
  files: TokenFile[];
  warnings: string[];
}

type TokenNode = Record<string, unknown>;

/** Scopes whose FLOAT variables represent lengths (exported as dimension). */
const DIMENSION_SCOPES = new Set([
  "WIDTH_HEIGHT",
  "GAP",
  "CORNER_RADIUS",
  "STROKE_FLOAT",
  "PARAGRAPH_SPACING",
  "PARAGRAPH_INDENT",
  "FONT_SIZE",
  "LETTER_SPACING",
  "EFFECT_FLOAT"
]);

const FONT_WEIGHT_PATTERNS: Array<[RegExp, number]> = [
  [/extra\s*light|ultra\s*light/i, 200],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/thin|hairline/i, 100],
  [/light/i, 300],
  [/medium/i, 500],
  [/black|heavy/i, 900],
  [/bold/i, 700],
  [/regular|normal|book/i, 400]
];

export function fontStyleToWeight(style: string): number {
  for (const [pattern, weight] of FONT_WEIGHT_PATTERNS) {
    if (pattern.test(style)) return weight;
  }
  return 400;
}

function px(value: number): { value: number; unit: "px" } {
  return { value, unit: "px" };
}

function round(n: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function insertToken(
  root: TokenNode,
  path: string[],
  token: TokenNode,
  warnings: string[]
): void {
  let node = root;
  for (const segment of path.slice(0, -1)) {
    const existing = node[segment];
    if (existing !== undefined && (typeof existing !== "object" || existing === null || "$value" in existing)) {
      warnings.push(`Name collision at "${path.join("/")}": group clashes with an existing token, skipped`);
      return;
    }
    if (existing === undefined) node[segment] = {};
    node = node[segment] as TokenNode;
  }
  const leaf = path[path.length - 1];
  if (node[leaf] !== undefined) {
    warnings.push(`Name collision at "${path.join("/")}": token already exists, skipped`);
    return;
  }
  node[leaf] = token;
}

function aliasToReference(
  id: string,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): string {
  const target = aliasTargets[id];
  if (!target) {
    warnings.push(`Unresolved alias target ${id}; emitted placeholder reference`);
    return `{unresolved.${id}}`;
  }
  return toReference(slugify(target.collectionName), target.name);
}

function variableToToken(
  variable: VariableData,
  value: VariableModeValue,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): TokenNode {
  const token: TokenNode = {};
  let booleanAsString = false;

  if (value.kind === "alias") {
    token.$value = aliasToReference(value.id, aliasTargets, warnings);
    switch (variable.resolvedType) {
      case "COLOR":
        token.$type = "color";
        break;
      case "FLOAT":
        token.$type = floatType(variable);
        break;
      case "TIMING":
        token.$type = "duration";
        break;
      case "EASING":
        token.$type = "cubicBezier";
        break;
      // STRING/BOOLEAN have no DTCG type; the reference carries the value
    }
  } else {
    switch (value.kind) {
      case "color":
        token.$type = "color";
        token.$value = rgbaToDtcgColor(value.r, value.g, value.b, value.a);
        break;
      case "cubicBezier":
        token.$type = "cubicBezier";
        token.$value = value.points.map((point) => round(point));
        break;
      case "float": {
        if (variable.resolvedType === "TIMING") {
          token.$type = "duration";
          token.$value = { value: round(value.value), unit: "ms" };
          break;
        }
        const type = floatType(variable);
        token.$type = type;
        token.$value = type === "dimension" ? px(round(value.value)) : round(value.value);
        break;
      }
      case "string":
        token.$value = value.value;
        break;
      case "boolean":
        // DTCG has no boolean value type and rejects untyped boolean values,
        // so the value is stringified and the original type kept as an extension.
        token.$value = String(value.value);
        booleanAsString = true;
        warnings.push(
          `Variable "${variable.name}" is a boolean; exported as the string "${token.$value}" because DTCG has no boolean type`
        );
        break;
    }
  }

  if (variable.description) token.$description = variable.description;

  const extensions: Record<string, unknown> = {};
  if (booleanAsString) extensions.originalType = "boolean";
  const codeSyntaxEntries = Object.keys(variable.codeSyntax);
  if (codeSyntaxEntries.length > 0) extensions.codeSyntax = variable.codeSyntax;
  const meaningfulScopes = variable.scopes.filter((s) => s !== "ALL_SCOPES");
  if (meaningfulScopes.length > 0) extensions.scopes = meaningfulScopes;
  if (Object.keys(extensions).length > 0) {
    token.$extensions = { [FIGMA_EXTENSION_KEY]: extensions };
  }

  return token;
}

function floatType(variable: VariableData): "dimension" | "number" | "fontWeight" {
  if (variable.scopes.includes("FONT_WEIGHT")) return "fontWeight";
  if (variable.scopes.some((s) => DIMENSION_SCOPES.has(s))) return "dimension";
  return "number";
}

function collectionTree(
  collection: CollectionData,
  modeId: string,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): TokenNode {
  const rootGroup = slugify(collection.name);
  const tree: TokenNode = {};
  for (const variable of collection.variables) {
    const value = variable.valuesByMode[modeId];
    if (value === undefined) {
      warnings.push(`Variable "${variable.name}" has no value for mode ${modeId}, skipped in that file`);
      continue;
    }
    insertToken(tree, nameToPath(variable.name), variableToToken(variable, value, aliasTargets, warnings), warnings);
  }
  return { [rootGroup]: tree };
}

function boundOrLiteral(
  boundVariableId: string | undefined,
  literal: unknown,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): unknown {
  if (!boundVariableId) return literal;
  const target = aliasTargets[boundVariableId];
  if (!target) {
    warnings.push(`Style bound to unknown variable ${boundVariableId}; literal value used`);
    return literal;
  }
  return toReference(slugify(target.collectionName), target.name);
}

function textStyleToToken(
  style: TextStyleData,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): TokenNode {
  const value: TokenNode = {
    fontFamily: boundOrLiteral(style.boundVariables.fontFamily, style.fontFamily, aliasTargets, warnings),
    fontWeight: fontStyleToWeight(style.fontStyle),
    fontSize: boundOrLiteral(style.boundVariables.fontSize, px(style.fontSize), aliasTargets, warnings),
    // DTCG dimension only allows px/rem, so percent letter spacing is resolved
    // against the style's own font size.
    letterSpacing: boundOrLiteral(
      style.boundVariables.letterSpacing,
      style.letterSpacing.unit === "PERCENT"
        ? px(round((style.letterSpacing.value / 100) * style.fontSize))
        : px(round(style.letterSpacing.value)),
      aliasTargets,
      warnings
    )
  };

  if (style.lineHeight.unit === "PERCENT" && style.lineHeight.value !== undefined) {
    value.lineHeight = round(style.lineHeight.value / 100);
  } else if (style.lineHeight.unit === "PIXELS" && style.lineHeight.value !== undefined) {
    value.lineHeight = style.fontSize > 0 ? round(style.lineHeight.value / style.fontSize) : 1;
  }
  if (style.boundVariables.lineHeight) {
    value.lineHeight = boundOrLiteral(style.boundVariables.lineHeight, value.lineHeight, aliasTargets, warnings);
  }

  const token: TokenNode = { $type: "typography", $value: value };
  if (style.description) token.$description = style.description;
  return token;
}

function paintStyleToToken(
  style: PaintStyleData,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): TokenNode | null {
  if (!style.paint) {
    warnings.push(`Paint style "${style.name}" has no exportable paint, skipped`);
    return null;
  }
  const token: TokenNode = {};
  if (style.paint.kind === "solid") {
    token.$type = "color";
    token.$value = boundOrLiteral(
      style.paint.boundColorVariableId,
      rgbaToDtcgColor(style.paint.color.r, style.paint.color.g, style.paint.color.b, style.paint.color.a),
      aliasTargets,
      warnings
    );
  } else {
    token.$type = "gradient";
    token.$value = style.paint.stops.map((stop) => ({
      color: rgbaToDtcgColor(stop.color.r, stop.color.g, stop.color.b, stop.color.a),
      position: round(stop.position)
    }));
    if (style.paint.gradientType !== "GRADIENT_LINEAR") {
      token.$extensions = { [FIGMA_EXTENSION_KEY]: { gradientType: style.paint.gradientType } };
    }
  }
  if (style.description) token.$description = style.description;
  return token;
}

function stylesTree(
  styles: StylesData,
  aliasTargets: Record<string, AliasTarget>,
  warnings: string[]
): TokenNode | null {
  const typography: TokenNode = {};
  const shadow: TokenNode = {};
  const color: TokenNode = {};

  for (const style of styles.text) {
    insertToken(typography, nameToPath(style.name), textStyleToToken(style, aliasTargets, warnings), warnings);
  }

  for (const style of styles.effect) {
    if (style.shadows.length === 0) {
      if (style.skippedEffectTypes.length > 0) {
        warnings.push(`Effect style "${style.name}" contains no shadow effects, skipped`);
      }
      continue;
    }
    const shadows = style.shadows.map((s) => ({
      color: rgbaToDtcgColor(s.color.r, s.color.g, s.color.b, s.color.a),
      offsetX: px(round(s.offset.x)),
      offsetY: px(round(s.offset.y)),
      blur: px(round(s.radius)),
      spread: px(round(s.spread)),
      ...(s.type === "INNER_SHADOW" ? { inset: true } : {})
    }));
    const token: TokenNode = {
      $type: "shadow",
      $value: shadows.length === 1 ? shadows[0] : shadows
    };
    if (style.description) token.$description = style.description;
    insertToken(shadow, nameToPath(style.name), token, warnings);
  }

  for (const style of styles.paint) {
    const token = paintStyleToToken(style, aliasTargets, warnings);
    if (token) insertToken(color, nameToPath(style.name), token, warnings);
  }

  const groups: TokenNode = {};
  if (Object.keys(typography).length > 0) groups.typography = typography;
  if (Object.keys(shadow).length > 0) groups.shadow = shadow;
  if (Object.keys(color).length > 0) groups.color = color;
  if (Object.keys(groups).length === 0) return null;
  return { [STYLES_ROOT_GROUP]: groups };
}

export function collectionHasAliases(collection: CollectionData): boolean {
  return collection.variables.some((v) =>
    Object.values(v.valuesByMode).some((value) => value.kind === "alias")
  );
}

/** Convert the full export to DTCG token files + resolver.json (paths relative to base path). */
export function convertExport(data: ExportData): ConversionResult {
  const warnings: string[] = [];
  const files: TokenFile[] = [];

  for (const collection of data.collections) {
    const slug = slugify(collection.name);
    if (collection.modes.length <= 1) {
      const modeId = collection.modes[0]?.modeId ?? collection.defaultModeId;
      files.push({
        path: `${slug}.tokens.json`,
        content: collectionTree(collection, modeId, data.aliasTargets, warnings)
      });
    } else {
      for (const mode of collection.modes) {
        files.push({
          path: `${slug}/${slugify(mode.name)}.tokens.json`,
          content: collectionTree(collection, mode.modeId, data.aliasTargets, warnings)
        });
      }
    }
  }

  const styles = stylesTree(data.styles, data.aliasTargets, warnings);
  if (styles) {
    files.push({ path: STYLES_FILE, content: styles });
  }

  files.push({
    path: RESOLVER_FILE,
    content: buildResolver(data, styles !== null)
  });

  return { files, warnings };
}
