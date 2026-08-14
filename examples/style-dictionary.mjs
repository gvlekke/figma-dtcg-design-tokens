/**
 * Style Dictionary 5 example for tokens exported by this plugin.
 *
 * Style Dictionary 5.5 does not read DTCG resolver documents, so the token
 * files are listed directly: shared sets first, then one mode per build.
 * The two transforms below cover the DTCG 2025.10 value types that Style
 * Dictionary does not handle yet (duration objects and gradients).
 */
import StyleDictionary from "style-dictionary";

StyleDictionary.registerTransform({
  name: "dtcg/duration/css",
  type: "value",
  transitive: true,
  filter: (token) => token.$type === "duration" && typeof token.$value === "object",
  transform: (token) => `${token.$value.value}${token.$value.unit}`
});

StyleDictionary.registerTransform({
  name: "dtcg/gradient/css",
  type: "value",
  transitive: true,
  filter: (token) => token.$type === "gradient",
  transform: (token) => {
    const stops = token.$value.map((stop) => {
      const color = stop.color.hex ?? stop.color;
      return `${color} ${Math.round(stop.position * 100)}%`;
    });
    const figmaType = token.$extensions?.["io.github.figma-dtcg-design-tokens"]?.gradientType;
    const fn = figmaType && figmaType !== "GRADIENT_LINEAR" ? "radial-gradient" : "linear-gradient";
    return `${fn}(${stops.join(", ")})`;
  }
});

/** One build per theme mode; adjust the file names to match your collections. */
const themes = [
  { name: "light", source: "tokens/semantic-colors/light.tokens.json" },
  { name: "dark", source: "tokens/semantic-colors/dark.tokens.json" }
];

for (const theme of themes) {
  const sd = new StyleDictionary({
    source: ["tokens/primitives.tokens.json", theme.source, "tokens/styles.tokens.json"],
    platforms: {
      css: {
        transformGroup: "css",
        transforms: ["dtcg/duration/css", "dtcg/gradient/css"],
        buildPath: "build/",
        files: [{ destination: `${theme.name}.css`, format: "css/variables" }]
      }
    }
  });
  await sd.buildAllPlatforms();
}
