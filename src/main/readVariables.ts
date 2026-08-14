import type {
  AliasTarget,
  CollectionData,
  VariableData,
  VariableModeValue
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

export async function readVariables(warnings: string[]): Promise<{
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
        const serialized = serializeValue(raw);
        if (!serialized) {
          warnings.push(
            `Variable "${v.name}" (${v.resolvedType}): value in mode ${modeId} has no DTCG equivalent, skipped`
          );
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
      warnings.push(`Alias target ${id} could not be resolved; reference will be kept by id`);
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
      warnings.push(
        `Variable alias points to library variable "${target.name}" which is not part of this export`
      );
    }
  }

  return { collections, aliasTargets };
}
