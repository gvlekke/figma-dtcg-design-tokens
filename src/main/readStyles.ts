import type {
  EffectStyleData,
  PaintData,
  PaintStyleData,
  ShadowEffectData,
  StylesData,
  TextStyleData
} from "../shared/types";

function readTextStyles(styles: TextStyle[], warnings: string[]): TextStyleData[] {
  return styles.map((s) => {
    const bound: TextStyleData["boundVariables"] = {};
    const bv = s.boundVariables ?? {};
    for (const key of ["fontFamily", "fontSize", "letterSpacing", "lineHeight", "fontStyle"] as const) {
      const alias = bv[key];
      if (alias && !Array.isArray(alias)) bound[key] = alias.id;
    }
    if (s.letterSpacing.unit !== "PIXELS" && s.letterSpacing.unit !== "PERCENT") {
      warnings.push(`Text style "${s.name}": unexpected letterSpacing unit ${s.letterSpacing.unit}`);
    }
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      letterSpacing: {
        unit: s.letterSpacing.unit === "PERCENT" ? "PERCENT" : "PIXELS",
        value: s.letterSpacing.value
      },
      lineHeight:
        s.lineHeight.unit === "AUTO"
          ? { unit: "AUTO" }
          : { unit: s.lineHeight.unit, value: s.lineHeight.value },
      boundVariables: bound
    };
  });
}

function readEffectStyles(styles: EffectStyle[], warnings: string[]): EffectStyleData[] {
  return styles.map((s) => {
    const shadows: ShadowEffectData[] = [];
    const skipped = new Set<string>();
    for (const effect of s.effects) {
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        shadows.push({
          type: effect.type,
          color: {
            r: effect.color.r,
            g: effect.color.g,
            b: effect.color.b,
            a: effect.color.a
          },
          offset: { x: effect.offset.x, y: effect.offset.y },
          radius: effect.radius,
          spread: effect.spread ?? 0
        });
      } else {
        skipped.add(effect.type);
      }
    }
    if (skipped.size > 0) {
      warnings.push(
        `Effect style "${s.name}": skipped effect types without a DTCG equivalent: ${[...skipped].join(", ")}`
      );
    }
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      shadows,
      skippedEffectTypes: [...skipped]
    };
  });
}

function readPaintStyles(styles: PaintStyle[], warnings: string[]): PaintStyleData[] {
  return styles.map((s) => {
    let paint: PaintData | null = null;
    const skipped = new Set<string>();
    for (const p of s.paints) {
      if (paint) {
        skipped.add(`${p.type} (extra paint layer)`);
        continue;
      }
      if (p.type === "SOLID") {
        const boundColor = p.boundVariables?.color;
        paint = {
          kind: "solid",
          color: { r: p.color.r, g: p.color.g, b: p.color.b, a: p.opacity ?? 1 },
          boundColorVariableId: boundColor?.id
        };
      } else if (
        p.type === "GRADIENT_LINEAR" ||
        p.type === "GRADIENT_RADIAL" ||
        p.type === "GRADIENT_ANGULAR" ||
        p.type === "GRADIENT_DIAMOND"
      ) {
        paint = {
          kind: "gradient",
          gradientType: p.type,
          stops: p.gradientStops.map((stop) => ({
            position: stop.position,
            color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
          }))
        };
      } else {
        skipped.add(p.type);
      }
    }
    if (skipped.size > 0) {
      warnings.push(`Paint style "${s.name}": skipped paints: ${[...skipped].join(", ")}`);
    }
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      paint,
      skippedPaintTypes: [...skipped]
    };
  });
}

export async function readStyles(warnings: string[]): Promise<StylesData> {
  const [text, effect, paint] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalPaintStylesAsync()
  ]);
  return {
    text: readTextStyles(text, warnings),
    effect: readEffectStyles(effect, warnings),
    paint: readPaintStyles(paint, warnings)
  };
}
