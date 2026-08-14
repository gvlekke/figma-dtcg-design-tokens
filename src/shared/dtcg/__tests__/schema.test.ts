import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { convertExport, RESOLVER_FILE } from "../convert";
import { makeFixture } from "./fixtures";

/**
 * Validates generated files against the official DTCG 2025.10 schemas
 * vendored in /schemas (downloaded from designtokens.org).
 */
function loadSchema(name: string): Record<string, unknown> {
  const path = fileURLToPath(new URL(`../../../../schemas/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function makeValidator(schema: Record<string, unknown>) {
  // The bundled subschemas carry their own $id, so ajv registers them while
  // compiling the root schema — adding them manually breaks $ref resolution.
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    logger: false,
    formats: { "uri-reference": true, "json-pointer-uri-fragment": true, uri: true }
  });
  return ajv.compile(schema);
}

describe("official DTCG 2025.10 schema validation", () => {
  const result = convertExport(makeFixture());
  const formatValidate = makeValidator(loadSchema("format.json"));
  const resolverValidate = makeValidator(loadSchema("resolver.json"));

  const tokenFiles = result.files.filter((f) => f.path !== RESOLVER_FILE);

  it.each(tokenFiles.map((f) => f.path))("%s validates against format.json", (path) => {
    const file = tokenFiles.find((f) => f.path === path)!;
    const valid = formatValidate(file.content);
    expect(formatValidate.errors ?? [], JSON.stringify(formatValidate.errors, null, 2)).toEqual([]);
    expect(valid).toBe(true);
  });

  it("resolver.json validates against resolver.json schema", () => {
    const resolver = result.files.find((f) => f.path === RESOLVER_FILE)!;
    const valid = resolverValidate(resolver.content);
    expect(resolverValidate.errors ?? [], JSON.stringify(resolverValidate.errors, null, 2)).toEqual([]);
    expect(valid).toBe(true);
  });
});
