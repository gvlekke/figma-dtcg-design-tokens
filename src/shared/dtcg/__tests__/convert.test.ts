import { describe, expect, it } from "vitest";
import { convertExport, fontStyleToWeight } from "../convert";
import { rgbaToDtcgColor } from "../color";
import { nameToPath, slugify, toReference } from "../names";
import { diffTokenFile, flattenTokens } from "../diff";
import { makeFixture } from "./fixtures";

function fileByPath(result: ReturnType<typeof convertExport>, path: string) {
  const file = result.files.find((f) => f.path === path);
  expect(file, `expected file ${path} in ${result.files.map((f) => f.path).join(", ")}`).toBeDefined();
  return file!;
}

function get(node: unknown, path: string[]): any {
  let current: any = node;
  for (const segment of path) {
    expect(current, `missing segment "${segment}"`).toBeTypeOf("object");
    current = current[segment];
  }
  return current;
}

describe("names", () => {
  it("splits slash names into sanitized paths", () => {
    expect(nameToPath("bg/Primary Hover")).toEqual(["bg", "Primary Hover"]);
    expect(nameToPath("weird.{name}/$x")).toEqual(["weird--name-", "x"]);
  });

  it("slugifies collection and mode names", () => {
    expect(slugify("Semantic Colors")).toBe("semantic-colors");
    expect(slugify("  Light ")).toBe("light");
  });

  it("builds references", () => {
    expect(toReference("primitives", "blue/500")).toBe("{primitives.blue.500}");
  });
});

describe("color", () => {
  it("converts rgba floats to DTCG 2025.10 color objects", () => {
    expect(rgbaToDtcgColor(0, 0.4, 0.8, 1)).toEqual({
      colorSpace: "srgb",
      components: [0, 0.4, 0.8],
      alpha: 1,
      hex: "#0066cc"
    });
  });
});

describe("fontStyleToWeight", () => {
  it("maps common style strings", () => {
    expect(fontStyleToWeight("Bold")).toBe(700);
    expect(fontStyleToWeight("SemiBold Italic")).toBe(600);
    expect(fontStyleToWeight("Extra Light")).toBe(200);
    expect(fontStyleToWeight("Regular")).toBe(400);
    expect(fontStyleToWeight("Unknown Style")).toBe(400);
  });
});

describe("convertExport", () => {
  const result = convertExport(makeFixture());

  it("emits one file per single-mode collection, per mode for multi-mode, styles and resolver", () => {
    expect(result.files.map((f) => f.path).sort()).toEqual([
      "primitives.tokens.json",
      "resolver.json",
      "semantic-colors/dark.tokens.json",
      "semantic-colors/light.tokens.json",
      "styles.tokens.json"
    ]);
  });

  it("wraps each collection in a root group named after its slug", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    expect(Object.keys(prim)).toEqual(["primitives"]);
  });

  it("converts color variables to DTCG color objects", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    const token = get(prim, ["primitives", "blue", "500"]);
    expect(token.$type).toBe("color");
    expect(token.$value.hex).toBe("#0066cc");
    expect(token.$value.colorSpace).toBe("srgb");
    expect(token.$description).toBe("Brand blue");
    expect(token.$extensions["io.github.figma-dtcg-design-tokens"].codeSyntax.WEB).toBe("var(--blue-500)");
  });

  it("types floats by scope: dimension / number / fontWeight", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    expect(get(prim, ["primitives", "space", "md"])).toMatchObject({
      $type: "dimension",
      $value: { value: 16, unit: "px" }
    });
    expect(get(prim, ["primitives", "opacity", "disabled"])).toMatchObject({
      $type: "number",
      $value: 0.4
    });
    expect(get(prim, ["primitives", "font", "weight", "bold"])).toMatchObject({
      $type: "fontWeight",
      $value: 700
    });
  });

  it("maps motion variables to duration and cubicBezier", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    expect(get(prim, ["primitives", "motion", "duration", "fast"])).toMatchObject({
      $type: "duration",
      $value: { value: 150, unit: "ms" }
    });
    expect(get(prim, ["primitives", "motion", "easing", "standard"])).toMatchObject({
      $type: "cubicBezier",
      $value: [0.42, 0, 0.58, 1]
    });
  });

  it("exports string variables untyped", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    const str = get(prim, ["primitives", "font", "family", "base"]);
    expect(str.$value).toBe("Rijksoverheid Sans");
    expect(str.$type).toBeUndefined();
  });

  it("stringifies boolean variables and records the original type", () => {
    const prim = fileByPath(result, "primitives.tokens.json").content;
    const flag = get(prim, ["primitives", "feature", "rounded"]);
    expect(flag.$value).toBe("true");
    expect(flag.$type).toBeUndefined();
    expect(flag.$extensions["io.github.figma-dtcg-design-tokens"].originalType).toBe("boolean");
    expect(result.warnings.some((w) => w.includes("feature/rounded"))).toBe(true);
  });

  it("converts aliases to DTCG references across collections", () => {
    const light = fileByPath(result, "semantic-colors/light.tokens.json").content;
    const token = get(light, ["semantic-colors", "bg", "primary"]);
    expect(token.$type).toBe("color");
    expect(token.$value).toBe("{primitives.blue.500}");
  });

  it("emits literal values for non-alias modes of the same variable", () => {
    const dark = fileByPath(result, "semantic-colors/dark.tokens.json").content;
    const token = get(dark, ["semantic-colors", "bg", "primary"]);
    expect(token.$value.hex).toBe("#0f0f1a");
  });

  it("converts text styles to typography composites with bound-variable references", () => {
    const styles = fileByPath(result, "styles.tokens.json").content;
    const token = get(styles, ["styles", "typography", "heading", "xl"]);
    expect(token.$type).toBe("typography");
    expect(token.$value.fontFamily).toBe("{primitives.font.family.base}");
    expect(token.$value.fontWeight).toBe(700);
    expect(token.$value.fontSize).toEqual({ value: 32, unit: "px" });
    expect(token.$value.letterSpacing).toEqual({ value: -0.64, unit: "px" });
    expect(token.$value.lineHeight).toBe(1.25);
  });

  it("converts effect styles to shadow arrays with inset for inner shadows", () => {
    const styles = fileByPath(result, "styles.tokens.json").content;
    const token = get(styles, ["styles", "shadow", "elevation", "2"]);
    expect(token.$type).toBe("shadow");
    expect(Array.isArray(token.$value)).toBe(true);
    expect(token.$value[0].offsetY).toEqual({ value: 2, unit: "px" });
    expect(token.$value[0].inset).toBeUndefined();
    expect(token.$value[1].inset).toBe(true);
  });

  it("converts paint styles: bound solid to reference, gradient to stops", () => {
    const styles = fileByPath(result, "styles.tokens.json").content;
    const solid = get(styles, ["styles", "color", "brand", "primary"]);
    expect(solid).toMatchObject({ $type: "color", $value: "{primitives.blue.500}" });
    const gradient = get(styles, ["styles", "color", "brand", "hero-gradient"]);
    expect(gradient.$type).toBe("gradient");
    expect(gradient.$value).toHaveLength(2);
    expect(gradient.$value[1].position).toBe(1);
    expect(gradient.$extensions["io.github.figma-dtcg-design-tokens"].gradientType).toBe("GRADIENT_RADIAL");
  });

  it("builds a resolver with sets, modifiers and resolution order", () => {
    const resolver = fileByPath(result, "resolver.json").content as any;
    expect(resolver.version).toBe("2025.10");
    expect(resolver.sets.primitives.sources).toEqual([{ $ref: "primitives.tokens.json" }]);
    expect(resolver.sets.styles.sources).toEqual([{ $ref: "styles.tokens.json" }]);
    expect(resolver.modifiers["semantic-colors"]).toEqual({
      contexts: {
        light: [{ $ref: "semantic-colors/light.tokens.json" }],
        dark: [{ $ref: "semantic-colors/dark.tokens.json" }]
      },
      default: "light"
    });
    expect(resolver.resolutionOrder).toEqual([
      { $ref: "#/sets/primitives" },
      { $ref: "#/modifiers/semantic-colors" },
      { $ref: "#/sets/styles" }
    ]);
  });

  it("only warns about the unrepresentable boolean variable", () => {
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("boolean");
  });
});

describe("diffTokenFile", () => {
  const result = convertExport(makeFixture());
  const prim = fileByPath(result, "primitives.tokens.json").content;

  it("marks everything added for a new file", () => {
    const diff = diffTokenFile("primitives.tokens.json", null, prim);
    expect(diff.status).toBe("new");
    expect(diff.added).toContain("primitives.blue.500");
  });

  it("detects unchanged files regardless of key order", () => {
    const reordered = JSON.stringify(prim); // same content
    const diff = diffTokenFile("primitives.tokens.json", reordered, prim);
    expect(diff.status).toBe("unchanged");
  });

  it("detects added, removed and changed tokens", () => {
    const old = JSON.parse(JSON.stringify(prim));
    delete old.primitives.feature; // removed in repo? no — removed from OLD means added in new
    old.primitives.space.md.$value.value = 20; // changed
    old.primitives.extra = { $type: "number", $value: 1 }; // exists only in repo -> removed
    const diff = diffTokenFile("primitives.tokens.json", JSON.stringify(old), prim);
    expect(diff.status).toBe("modified");
    expect(diff.added).toEqual(["primitives.feature.rounded"]);
    expect(diff.changed).toEqual(["primitives.space.md"]);
    expect(diff.removed).toEqual(["primitives.extra"]);
  });

  it("flattens nested groups to dot paths", () => {
    const flat = flattenTokens(prim);
    expect(flat.map((t) => t.path)).toContain("primitives.font.weight.bold");
  });
});
