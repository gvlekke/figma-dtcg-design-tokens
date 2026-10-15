import type {
  AliasTarget,
  CollectionData,
  VariableData,
  VariableModeValue,
  Warning
} from "../shared/types";

/**
 * Figma easing presets that have an exact CSS cubic-bezier equivalent.
 * Spring and "back" presets have no cubic bezier form and are skipped.
 */
const EASING_PRESET_BEZIERS: Record<string, [number, number, number, number]> = {
  LINEAR: [0, 0, 1, 1],
  EASE_IN: [0.42, 0, 1, 1],
  EASE_OUT: [0, 0, 0.58, 1],
  EASE_IN_AND_OUT: [0.42, 0, 0.58, 1]
};

/** Figma color alias with an opacity override: `{ color: alias, opacity: 0-100 }` */
interface AliasWithOpacity {
  aliasId: string;
  opacity: number;
}

function asAliasWithOpacity(value: unknown): AliasWithOpacity | null {
  if (typeof value !== "object" || value === null) return null;
  const { color, opacity } = value as { color?: unknown; opacity?: unknown };
  if (typeof opacity !== "number" || typeof color !== "object" || color === null) return null;
  const alias = color as { type?: unknown; id?: unknown };
  if (alias.type !== "VARIABLE_ALIAS" || typeof alias.id !== "string") return null;
  return { aliasId: alias.id, opacity };
}

/**
 * Follows an alias chain to a literal color. A target in the same collection
 * is read in the same mode; a target in another collection is read in that
 * collection's default mode, since there is no consumer to pick a mode from.
 */
async function resolveColor(
  aliasId: string,
  collectionId: string,
  modeId: string,
  warnings: Warning[],
  variableName: string
): Promise<{ r: number; g: number; b: number; a: number } | null> {
  const seen = new Set<string>();
  let id = aliasId;
  let currentCollectionId = collectionId;
  let currentModeId = modeId;
  while (!seen.has(id)) {
    seen.add(id);
    const target = await figma.variables.getVariableByIdAsync(id);
    if (!target) return null;
    if (target.variableCollectionId !== currentCollectionId) {
      const targetCollection = await figma.variables.getVariableCollectionByIdAsync(
        target.variableCollectionId
      );
      if (!targetCollection) return null;
      if (targetCollection.modes.length > 1) {
        const defaultMode = targetCollection.modes.find(
          (m) => m.modeId === targetCollection.defaultModeId
        );
        warnings.push({
          message: "Opacity overrides on a source color with multiple modes, resolved using its default mode",
          item: `${variableName} → ${target.name} (mode "${defaultMode?.name ?? targetCollection.defaultModeId}")`
        });
      }
      currentCollectionId = target.variableCollectionId;
      currentModeId = targetCollection.defaultModeId;
    }
    const raw = target.valuesByMode[currentModeId];
    if (typeof raw === "object" && raw !== null && "r" in raw) {
      return { r: raw.r, g: raw.g, b: raw.b, a: "a" in raw ? raw.a : 1 };
    }
    const isAlias =
      typeof raw === "object" && raw !== null && "type" in raw && raw.type === "VARIABLE_ALIAS";
    const next = isAlias ? raw.id : asAliasWithOpacity(raw)?.aliasId;
    if (!next) return null;
    id = next;
  }
  return null;
}

function serializeValue(value: VariableValue): VariableModeValue | null {
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (typeof value === "number") return { kind: "float", value };
  if (typeof value === "string") return { kind: "string", value };
  if (typeof value === "object" && value !== null) {
    if ("type" in value && value.type === "VARIABLE_ALIAS") {
      return { kind: "alias", id: value.id };
    }
    if ("r" in value) {
      const { r, g, b } = value;
      const a = "a" in value ? value.a : 1;
      return { kind: "color", r, g, b, a };
    }
    if ("type" in value) {
      const bezier = value.easingFunctionCubicBezier;
      if (bezier) {
        return { kind: "cubicBezier", points: [bezier.x1, bezier.y1, bezier.x2, bezier.y2] };
      }
      const preset = EASING_PRESET_BEZIERS[value.type];
      if (preset) return { kind: "cubicBezier", points: preset };
    }
  }
  return null;
}

export async function readVariables(warnings: Warning[]): Promise<{
  collections: CollectionData[];
  aliasTargets: Record<string, AliasTarget>;
}> {
  const figmaCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const figmaVariables = await figma.variables.getLocalVariablesAsync();

  const byCollection = new Map<string, Variable[]>();
  for (const v of figmaVariables) {
    const list = byCollection.get(v.variableCollectionId) ?? [];
    list.push(v);
    byCollection.set(v.variableCollectionId, list);
  }

  const aliasTargets: Record<string, AliasTarget> = {};
  const localCollectionNames = new Map<string, string>(
    figmaCollections.map((c) => [c.id, c.name])
  );

  // Every local variable is a potential alias target.
  for (const v of figmaVariables) {
    aliasTargets[v.id] = {
      collectionId: v.variableCollectionId,
      collectionName: localCollectionNames.get(v.variableCollectionId) ?? "",
      name: v.name,
      remote: false
    };
  }

  const collections: CollectionData[] = [];
  const pendingAliasIds = new Set<string>();

  for (const collection of figmaCollections) {
    const variables: VariableData[] = [];
    for (const v of byCollection.get(collection.id) ?? []) {
      const valuesByMode: Record<string, VariableModeValue> = {};
      for (const [modeId, raw] of Object.entries(v.valuesByMode)) {
        const mode = collection.modes.find((m) => m.modeId === modeId);
        const modeLabel = mode
          ? `mode "${mode.name}" (${modeId})`
          : `mode ${modeId} (not a mode of collection "${collection.name}")`;
        const withOpacity = asAliasWithOpacity(raw);
        if (withOpacity) {
          const color = await resolveColor(
            withOpacity.aliasId,
            collection.id,
            modeId,
            warnings,
            v.name
          );
          if (color) {
            // Figma's opacity override is a percentage applied on top of the source alpha.
            valuesByMode[modeId] = { kind: "color", ...color, a: color.a * (withOpacity.opacity / 100) };
            continue;
          }
          warnings.push({
            message: "Opacity overrides whose source color could not be resolved, skipped",
            item: `${v.name} in ${modeLabel} (source ${withOpacity.aliasId})`
          });
          continue;
        }
        const serialized = serializeValue(raw);
        if (!serialized) {
          warnings.push({
            message: "Variable values without a DTCG equivalent, skipped",
            item: `${v.name} (${v.resolvedType}) in ${modeLabel}: ${JSON.stringify(raw)}`
          });
          continue;
        }
        if (serialized.kind === "alias" && !aliasTargets[serialized.id]) {
          pendingAliasIds.add(serialized.id);
        }
        valuesByMode[modeId] = serialized;
      }
      variables.push({
        id: v.id,
        name: v.name,
        description: v.description ?? "",
        resolvedType: v.resolvedType,
        scopes: [...v.scopes],
        codeSyntax: { ...v.codeSyntax },
        valuesByMode
      });
    }
    collections.push({
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
      variables
    });
  }

  // Resolve alias targets that point outside local variables (library variables).
  for (const id of pendingAliasIds) {
    const target = await figma.variables.getVariableByIdAsync(id);
    if (!target) {
      warnings.push({
        message: "Alias targets that could not be resolved, references kept by id",
        item: id
      });
      continue;
    }
    const targetCollection = await figma.variables.getVariableCollectionByIdAsync(
      target.variableCollectionId
    );
    aliasTargets[id] = {
      collectionId: target.variableCollectionId,
      collectionName: targetCollection?.name ?? "",
      name: target.name,
      remote: target.remote
    };
    if (target.remote) {
      warnings.push({
        message: "Aliases to library variables that are not part of this export",
        item: target.name
      });
    }
  }

  return { collections, aliasTargets };
}
