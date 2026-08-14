# DTCG Design Tokens

Figma plugin that exports the variables and styles of a Figma file as [W3C DTCG design tokens](https://www.designtokens.org/tr/drafts/format/) (specification version **2025.10**) and pushes them to a self-hosted GitLab instance from the browser.

Everything runs inside Figma: the plugin main thread reads the document through the Plugin API, and the plugin UI talks to the GitLab REST API with `fetch`. No backend, and no Figma Enterprise plan (the REST Variables API is not used).

## Setup

```bash
npm install
npm run build
```

In Figma: **Plugins → Development → Import plugin from manifest…** and pick `manifest.json`.

During development, `npm run watch` rebuilds both bundles on change.

## Configuration

On the plugin's **Settings** tab:

| Field | Notes |
| --- | --- |
| GitLab instance URL | e.g. `https://gitlab.example.com` — any host, since the manifest allows all domains |
| Project | numeric project id, or the full path such as `design-system/tokens` |
| Personal access token | needs the `api` scope; stored in `figma.clientStorage`, which is local to your Figma client |
| Token directory | repo directory the files live in, default `tokens` |

**Test connection** verifies the URL, project and token before you try to push.

The per-push options live on the **Push** tab, next to the diff they affect:

| Field | Notes |
| --- | --- |
| Target branch | branch to commit to, or the merge request target; changing it clears the current comparison |
| Push flow | commit straight to the target branch, or create a branch and open a merge request |
| Commit message | message for the commit, also the merge request title |

All three are remembered between sessions, like the settings above.

## Output

One file per collection (per mode when a collection has several), plus a resolver document:

```
tokens/
├── resolver.json
├── primitives.tokens.json
├── semantic-colors/
│   ├── light.tokens.json
│   └── dark.tokens.json
└── styles.tokens.json
```

The DTCG format module has no concept of modes, so modes are expressed with the companion [resolver module](https://www.designtokens.org/tr/drafts/resolver/): single-mode collections become `sets`, multi-mode collections become `modifiers` with one context per mode, and `resolutionOrder` lists alias-free collections first so references resolve onto already-merged tokens.

```json
{
  "$schema": "https://www.designtokens.org/schemas/2025.10/resolver.json",
  "version": "2025.10",
  "sets": { "primitives": { "sources": [{ "$ref": "primitives.tokens.json" }] } },
  "modifiers": {
    "semantic-colors": {
      "contexts": {
        "light": [{ "$ref": "semantic-colors/light.tokens.json" }],
        "dark": [{ "$ref": "semantic-colors/dark.tokens.json" }]
      },
      "default": "light"
    }
  },
  "resolutionOrder": [{ "$ref": "#/sets/primitives" }, { "$ref": "#/modifiers/semantic-colors" }]
}
```

Every generated file is validated against the official DTCG 2025.10 JSON schemas in the test suite (`schemas/` holds copies downloaded from designtokens.org).

## Conversion rules

| Figma | DTCG |
| --- | --- |
| Collection | Root group named after the collection slug; a resolver set or modifier |
| Mode | Resolver modifier context (one file per mode) |
| `bg/primary` | Nested groups `bg` → `primary` |
| COLOR | `color` — `{ colorSpace: "srgb", components, alpha, hex }` (hex kept as a fallback) |
| FLOAT with a size/spacing scope | `dimension` in `px` |
| FLOAT with the font-weight scope | `fontWeight` |
| Other FLOAT | `number` |
| TIMING | `duration` in `ms` |
| EASING | `cubicBezier` |
| STRING | untyped `$value` string |
| BOOLEAN | see limitations below |
| Variable alias | reference such as `{primitives.blue.500}`, across collections too |
| Variable description | `$description` |
| `codeSyntax` and scopes | `$extensions["io.github.figma-dtcg-design-tokens"]` |
| Text style | `typography` composite |
| Effect style | `shadow` (an array for multi-shadow styles, `inset: true` for inner shadows) |
| Paint style, solid | `color` |
| Paint style, gradient | `gradient` with stops |
| Variables bound inside a style | references to the corresponding tokens |
| Grid styles, image paints, blur effects | skipped, reported as warnings |

The **Tokens** tab lists every conversion warning, and **Download .zip** gets you the same files without touching GitLab.

## Pushing

The **Push** tab compares the export against the target branch before anything is written: it fetches the current files and reports added, changed and removed tokens per file. Push is blocked when nothing changed.

All files go in a single atomic commit (`POST /repository/commits` with a `create`/`update`/`delete` action per file). In merge request mode the plugin creates a `figma-tokens/<timestamp>` branch, commits there, and opens a merge request that summarises the diff.

Only files this plugin generates (`*.tokens.json` and `resolver.json`) are ever updated or deleted, so anything else in the token directory — a README, a build config — is left alone. Generated files that the Figma file no longer produces are deleted, which keeps renamed collections from leaving orphans behind.

## Limitations

- **Booleans.** DTCG has no boolean type, and its schema rejects untyped boolean values. Boolean variables are exported as the strings `"true"` / `"false"` with `$extensions["io.github.figma-dtcg-design-tokens"].originalType: "boolean"`, and each one raises a warning.
- **Strings.** DTCG has no generic string type either. String variables are exported untyped, which the spec permits.
- **Percentage letter spacing.** DTCG `dimension` allows only `px` and `rem`, so percentage letter spacing is resolved against the style's own font size.
- **Spring and "back" easings.** These have no cubic-bezier form and are skipped with a warning. Bezier presets and custom beziers convert fine.
- **Library variables.** Aliases pointing at another file's library variables are emitted as references, but the target tokens are not part of this export. Each one raises a warning.
- **CORS.** GitLab's API returns `Access-Control-Allow-Origin: *`, so a personal access token works from the browser. If your instance sits behind a reverse proxy that strips those headers, **Test connection** fails with a network error — that is fixed in the proxy configuration, not in the plugin.

## Consuming the tokens

Style Dictionary 5.5 reads these files, resolves cross-file references, and handles DTCG colors, dimensions, shadows and cubic beziers. Two things it does not do yet:

- it does not read resolver documents, so list the token files per mode explicitly;
- it has no transform for DTCG 2025.10 `duration` objects or for gradients.

`examples/style-dictionary.mjs` is a working config that covers both, verified against Style Dictionary 5.5.1.

## Tests

```bash
npm test        # conversion, resolver, diff, push planning, DTCG schema validation
npm run typecheck
```
