# AGENTS.md

Instructions for AI coding agents working in this repository. See `README.md` for what the plugin does and how its output is shaped.

## Project

Figma plugin that exports variables and styles as W3C DTCG design tokens (spec version 2025.10) and pushes them to a self-hosted GitLab instance. No backend: everything runs inside Figma.

- `src/main/` — plugin main thread. Reads the Figma document through the Plugin API (`readVariables.ts`, `readStyles.ts`) into a serializable `ExportData` model, and stores settings (`storage.ts`).
- `src/shared/` — code used by both threads. `types.ts` defines the intermediate model; `dtcg/` converts it to DTCG files (`convert.ts`), builds `resolver.json` (`resolver.ts`) and diffs token files (`diff.ts`); `warnings.ts` groups warnings for display.
- `src/ui/` — Preact UI. Runs the conversion, shows the export, and talks to the GitLab REST API (`gitlab.ts`, `push.ts`).
- `schemas/` — DTCG format and resolver JSON schemas, used by `schema.test.ts` to validate the output.
- `examples/style-dictionary.mjs` — example consumer of the exported tokens.

## Commands

```bash
npm test           # vitest: conversion, resolver, diff, push planning, schema validation
npm run typecheck  # tsc --noEmit
npm run build      # bundles src/main to dist/code.js and src/ui to dist/index.html
npm run watch      # rebuild both bundles on change
```

## Workflow

After every change:

1. Run `npm test` and `npm run typecheck`. Both must pass.
2. Run `npm run build`. Figma loads the plugin from `dist/` (which is git-ignored), so the plugin keeps running the old code until it is rebuilt and reopened in Figma.
3. Update `CHANGELOG.md`: add an entry under `## [Unreleased]` in the matching section (`Added`, `Changed`, `Fixed`, `Removed`), following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Describe the effect for users of the plugin or its token files, not the code change. Mark changes that affect consumers of the token files with **Breaking:**.
4. Update `README.md` when the change affects the output, the conversion rules or the limitations described there.

Make edits with targeted file edits rather than scripts that rewrite files, so each change is visible as a diff.

## Conventions

- **DTCG compliance.** Output must stay valid DTCG 2025.10; `schema.test.ts` checks it. When Figma has no exact DTCG equivalent, emit a valid fallback and keep the original meaning in the extension (see auto line height and booleans).
- **Extension namespace.** Plugin-specific data goes under `$extensions["io.github.gvlekke.figma-dtcg-design-tokens"]`, via the `FIGMA_EXTENSION_KEY` constant in `convert.ts`. Never hardcode the key in source; renaming it is a breaking change for consumers.
- **Warnings.** Push `{ message, item }` (`Warning` in `types.ts`): `message` is a fixed sentence describing the kind of problem and what was done about it, `item` names the affected variable, style or token. Never interpolate names into `message`, or the warnings will not group in the UI.
- **Main thread vs. UI.** `src/main` only reads Figma and produces plain, serializable data; conversion logic belongs in `src/shared` so it can be unit-tested without Figma.
- **Tests.** Add or update tests in `src/shared/dtcg/__tests__/` for conversion changes; extend `fixtures.ts` or modify a copy of `makeFixture()` inside the test.
