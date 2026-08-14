/**
 * Token-level diff between the current repo state and a fresh export.
 * Works on parsed DTCG documents: flattens groups to dot paths, compares
 * $value/$type/$description per token.
 */

export interface FlatToken {
  path: string;
  token: Record<string, unknown>;
}

export interface FileDiff {
  path: string;
  status: "new" | "deleted" | "modified" | "unchanged" | "replaced";
  added: string[];
  removed: string[];
  changed: string[];
}

function isToken(node: unknown): node is Record<string, unknown> {
  return typeof node === "object" && node !== null && "$value" in node;
}

export function flattenTokens(doc: Record<string, unknown>, prefix: string[] = []): FlatToken[] {
  const result: FlatToken[] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith("$")) continue;
    if (isToken(value)) {
      result.push({ path: [...prefix, key].join("."), token: value });
    } else if (typeof value === "object" && value !== null) {
      result.push(...flattenTokens(value as Record<string, unknown>, [...prefix, key]));
    }
  }
  return result;
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

export function diffTokenFile(
  path: string,
  oldContent: string | null,
  newContent: Record<string, unknown>
): FileDiff {
  if (oldContent === null) {
    return {
      path,
      status: "new",
      added: flattenTokens(newContent).map((t) => t.path),
      removed: [],
      changed: []
    };
  }

  let oldDoc: Record<string, unknown>;
  try {
    oldDoc = JSON.parse(oldContent) as Record<string, unknown>;
  } catch {
    return {
      path,
      status: "replaced",
      added: flattenTokens(newContent).map((t) => t.path),
      removed: [],
      changed: []
    };
  }

  const oldTokens = new Map(flattenTokens(oldDoc).map((t) => [t.path, t.token]));
  const newTokens = new Map(flattenTokens(newContent).map((t) => [t.path, t.token]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [tokenPath, token] of newTokens) {
    const old = oldTokens.get(tokenPath);
    if (!old) {
      added.push(tokenPath);
    } else if (stable(old) !== stable(token)) {
      changed.push(tokenPath);
    }
  }
  for (const tokenPath of oldTokens.keys()) {
    if (!newTokens.has(tokenPath)) removed.push(tokenPath);
  }

  const status =
    added.length + removed.length + changed.length > 0 ? "modified" : "unchanged";
  return { path, status, added, removed, changed };
}
