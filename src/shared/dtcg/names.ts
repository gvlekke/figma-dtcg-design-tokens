/**
 * DTCG token/group names must not contain "{", "}", "." and must not start with "$".
 * Figma variable names use "/" as group separator.
 */
export function sanitizeSegment(segment: string): string {
  const cleaned = segment.trim().replace(/[{}.]/g, "-").replace(/^\$/, "");
  return cleaned.length > 0 ? cleaned : "unnamed";
}

/** "bg/Primary Hover" -> ["bg", "Primary Hover"] sanitized */
export function nameToPath(name: string): string[] {
  return name
    .split("/")
    .map(sanitizeSegment)
    .filter((s) => s.length > 0);
}

/** File-system/URL friendly identifier for collections, modes, files. */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "unnamed";
}

/** DTCG alias reference from a collection root group + variable name. */
export function toReference(rootGroup: string, variableName: string): string {
  return `{${[rootGroup, ...nameToPath(variableName)].join(".")}}`;
}
