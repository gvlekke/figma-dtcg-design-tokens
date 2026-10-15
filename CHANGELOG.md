# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** the `$extensions` namespace is now `io.github.gvlekke.figma-dtcg-design-tokens` (was `io.github.figma-dtcg-design-tokens`). Transforms that read `codeSyntax`, `scopes`, `originalType` or `gradientType` from the old key need to be updated. The Style Dictionary example has been updated.
- Text styles with auto line height now export `lineHeight: 1.2` with `$extensions[…].lineHeight: "auto"` instead of omitting `lineHeight`, so typography tokens always carry the value DTCG requires. Transforms can use the marker to emit `line-height: normal`.
- Line-height variables (`LINE_HEIGHT` scope) with a value of 0 or less, such as `-1`, are treated as auto: exported as `1.2` with the same `"auto"` marker, instead of the literal value.
- The plugin manifest uses the Figma-assigned plugin ID.
- Conversion warnings are grouped by kind: each kind is listed once and expands to the affected variables, styles or tokens, without duplicates across modes. A kind with a single item is shown inline.
- Warnings for variable values without a DTCG equivalent now name the mode and include the raw value.

### Added

- `AGENTS.md` with project structure, commands, workflow and conventions for AI coding agents, and a `CLAUDE.md` that imports it.
- Color variables that alias another color with an opacity override are exported as a literal color with the combined alpha. Aliases into another collection resolve in that collection's default mode, with a warning when it has multiple modes.

## [0.1.0] - 2026-08-14

### Added

- Initial release: export Figma variables and styles as W3C DTCG design tokens, download them as a .zip, or push them to a GitLab repository in a single commit or merge request.
