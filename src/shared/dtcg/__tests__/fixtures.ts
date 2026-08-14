import type { ExportData } from "../../types";

/**
 * Fixture: two collections + styles.
 * - "Primitives": single mode, colors + floats with various scopes + string/boolean
 * - "Semantic Colors": two modes (Light default, Dark), aliases into Primitives
 * - styles: text, effect (multi shadow), paint (solid bound to variable, gradient)
 */
export function makeFixture(): ExportData {
  return {
    fileName: "Example Design System",
    collections: [
      {
        id: "coll-prim",
        name: "Primitives",
        defaultModeId: "m-default",
        modes: [{ modeId: "m-default", name: "Value" }],
        variables: [
          {
            id: "v-blue",
            name: "blue/500",
            description: "Brand blue",
            resolvedType: "COLOR",
            scopes: ["ALL_SCOPES"],
            codeSyntax: { WEB: "var(--blue-500)" },
            valuesByMode: {
              "m-default": { kind: "color", r: 0, g: 0.4, b: 0.8, a: 1 }
            }
          },
          {
            id: "v-space",
            name: "space/md",
            description: "",
            resolvedType: "FLOAT",
            scopes: ["GAP", "WIDTH_HEIGHT"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "float", value: 16 } }
          },
          {
            id: "v-opacity",
            name: "opacity/disabled",
            description: "",
            resolvedType: "FLOAT",
            scopes: ["OPACITY"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "float", value: 0.4 } }
          },
          {
            id: "v-weight",
            name: "font/weight/bold",
            description: "",
            resolvedType: "FLOAT",
            scopes: ["FONT_WEIGHT"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "float", value: 700 } }
          },
          {
            id: "v-family",
            name: "font/family/base",
            description: "",
            resolvedType: "STRING",
            scopes: ["ALL_SCOPES"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "string", value: "Rijksoverheid Sans" } }
          },
          {
            id: "v-duration",
            name: "motion/duration/fast",
            description: "",
            resolvedType: "TIMING",
            scopes: ["ALL_SCOPES"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "float", value: 150 } }
          },
          {
            id: "v-easing",
            name: "motion/easing/standard",
            description: "",
            resolvedType: "EASING",
            scopes: ["ALL_SCOPES"],
            codeSyntax: {},
            valuesByMode: {
              "m-default": { kind: "cubicBezier", points: [0.42, 0, 0.58, 1] }
            }
          },
          {
            id: "v-flag",
            name: "feature/rounded",
            description: "",
            resolvedType: "BOOLEAN",
            scopes: ["ALL_SCOPES"],
            codeSyntax: {},
            valuesByMode: { "m-default": { kind: "boolean", value: true } }
          }
        ]
      },
      {
        id: "coll-sem",
        name: "Semantic Colors",
        defaultModeId: "m-light",
        modes: [
          { modeId: "m-light", name: "Light" },
          { modeId: "m-dark", name: "Dark" }
        ],
        variables: [
          {
            id: "v-bg",
            name: "bg/primary",
            description: "",
            resolvedType: "COLOR",
            scopes: ["FRAME_FILL", "SHAPE_FILL"],
            codeSyntax: {},
            valuesByMode: {
              "m-light": { kind: "alias", id: "v-blue" },
              "m-dark": { kind: "color", r: 0.06, g: 0.06, b: 0.1, a: 1 }
            }
          }
        ]
      }
    ],
    aliasTargets: {
      "v-blue": { collectionId: "coll-prim", collectionName: "Primitives", name: "blue/500", remote: false },
      "v-space": { collectionId: "coll-prim", collectionName: "Primitives", name: "space/md", remote: false },
      "v-opacity": { collectionId: "coll-prim", collectionName: "Primitives", name: "opacity/disabled", remote: false },
      "v-weight": { collectionId: "coll-prim", collectionName: "Primitives", name: "font/weight/bold", remote: false },
      "v-family": { collectionId: "coll-prim", collectionName: "Primitives", name: "font/family/base", remote: false },
      "v-flag": { collectionId: "coll-prim", collectionName: "Primitives", name: "feature/rounded", remote: false },
      "v-duration": { collectionId: "coll-prim", collectionName: "Primitives", name: "motion/duration/fast", remote: false },
      "v-easing": { collectionId: "coll-prim", collectionName: "Primitives", name: "motion/easing/standard", remote: false },
      "v-bg": { collectionId: "coll-sem", collectionName: "Semantic Colors", name: "bg/primary", remote: false }
    },
    styles: {
      text: [
        {
          id: "s-heading",
          name: "heading/xl",
          description: "Page title",
          fontFamily: "Rijksoverheid Sans",
          fontStyle: "Bold",
          fontSize: 32,
          letterSpacing: { unit: "PERCENT", value: -2 },
          lineHeight: { unit: "PIXELS", value: 40 },
          boundVariables: { fontFamily: "v-family" }
        }
      ],
      effect: [
        {
          id: "s-elev",
          name: "elevation/2",
          description: "",
          shadows: [
            {
              type: "DROP_SHADOW",
              color: { r: 0, g: 0, b: 0, a: 0.2 },
              offset: { x: 0, y: 2 },
              radius: 8,
              spread: 0
            },
            {
              type: "INNER_SHADOW",
              color: { r: 1, g: 1, b: 1, a: 0.1 },
              offset: { x: 0, y: 1 },
              radius: 0,
              spread: 0
            }
          ],
          skippedEffectTypes: []
        }
      ],
      paint: [
        {
          id: "s-brand",
          name: "brand/primary",
          description: "",
          paint: {
            kind: "solid",
            color: { r: 0, g: 0.4, b: 0.8, a: 1 },
            boundColorVariableId: "v-blue"
          },
          skippedPaintTypes: []
        },
        {
          id: "s-hero",
          name: "brand/hero-gradient",
          description: "",
          paint: {
            kind: "gradient",
            gradientType: "GRADIENT_RADIAL",
            stops: [
              { position: 0, color: { r: 0, g: 0.4, b: 0.8, a: 1 } },
              { position: 1, color: { r: 0, g: 0.1, b: 0.3, a: 1 } }
            ]
          },
          skippedPaintTypes: []
        }
      ]
    },
    warnings: []
  };
}
