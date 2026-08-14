import type { ExportData } from "../types";
import { slugify } from "./names";

/**
 * Builds the DTCG Resolver document (2025.10 resolver module).
 * - single-mode collection  -> set with one source file
 * - multi-mode collection   -> modifier with one context per mode
 * - styles                  -> trailing set (styles may reference variables)
 * Alias-free sets are ordered first so references resolve onto already-merged tokens.
 */
export function buildResolver(data: ExportData, includeStyles: boolean): Record<string, unknown> {
  const sets: Record<string, unknown> = {};
  const modifiers: Record<string, unknown> = {};
  const setOrder: Array<{ name: string; hasAliases: boolean }> = [];
  const modifierOrder: string[] = [];

  for (const collection of data.collections) {
    const slug = slugify(collection.name);
    const hasAliases = collection.variables.some((v) =>
      Object.values(v.valuesByMode).some((value) => value.kind === "alias")
    );

    if (collection.modes.length <= 1) {
      sets[slug] = { sources: [{ $ref: `${slug}.tokens.json` }] };
      setOrder.push({ name: slug, hasAliases });
    } else {
      const contexts: Record<string, unknown> = {};
      for (const mode of collection.modes) {
        contexts[slugify(mode.name)] = [{ $ref: `${slug}/${slugify(mode.name)}.tokens.json` }];
      }
      const defaultMode = collection.modes.find((m) => m.modeId === collection.defaultModeId);
      modifiers[slug] = {
        contexts,
        default: slugify(defaultMode?.name ?? collection.modes[0].name)
      };
      modifierOrder.push(slug);
    }
  }

  if (includeStyles) {
    sets.styles = { sources: [{ $ref: "styles.tokens.json" }] };
  }

  const resolutionOrder: Array<{ $ref: string }> = [
    ...setOrder
      .sort((a, b) => Number(a.hasAliases) - Number(b.hasAliases))
      .map((s) => ({ $ref: `#/sets/${s.name}` })),
    ...modifierOrder.map((m) => ({ $ref: `#/modifiers/${m}` }))
  ];
  if (includeStyles) resolutionOrder.push({ $ref: "#/sets/styles" });

  const document: Record<string, unknown> = {
    $schema: "https://www.designtokens.org/schemas/2025.10/resolver.json",
    version: "2025.10",
    name: data.fileName,
    sets,
    resolutionOrder
  };
  if (Object.keys(modifiers).length > 0) document.modifiers = modifiers;
  return document;
}
