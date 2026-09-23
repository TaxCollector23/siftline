export interface GraphqlAst { prefix: string; rootField: string; fields: string[] }

const graphqlName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parse only the deliberately small GraphQL shape that Cutdex can rewrite
 * without changing the response contract:
 *
 *   query Name { root { field anotherField } }
 *
 * Arguments, aliases, fragments, directives, multiple root fields, and
 * deeper nesting pass through. A flattened selection is worse than no
 * optimization because it changes the shape returned by the source API.
 */
export function parseGraphql(input: string): GraphqlAst | null {
  const trimmed = input.trim();
  const open = trimmed.indexOf("{");
  const close = trimmed.lastIndexOf("}");
  if (open < 0 || close <= open || trimmed.slice(close + 1).trim()) return null;

  const prefix = trimmed.slice(0, open).trim();
  const body = trimmed.slice(open + 1, close).trim();
  const rootMatch = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*)\}$/);
  if (!prefix || !rootMatch?.[1] || rootMatch[2] === undefined) return null;

  const fields = rootMatch[2].trim().split(/[\s,]+/).filter(Boolean);
  if (!fields.length || fields.some((field) => !graphqlName.test(field))) return null;
  return { prefix, rootField: rootMatch[1], fields };
}

export function printGraphql(ast: GraphqlAst): string {
  return `${ast.prefix} {\n  ${ast.rootField} {\n    ${ast.fields.join("\n    ")}\n  }\n}`;
}

function mentions(task: string, field: string): boolean {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(task);
}

export function optimizeGraphql(task: string, query: string): { ast: GraphqlAst; selected: string[] } | null {
  const ast = parseGraphql(query);
  if (!ast) return null;
  const requested = ast.fields.filter((field) => {
    const name = field.toLowerCase();
    return mentions(task, field) || (name === "updatedat" && mentions(task, "updated")) || (name === "number" && mentions(task, "issue"));
  });
  if (!requested.length || requested.length === ast.fields.length) return null;
  return { ast: { ...ast, fields: requested }, selected: requested };
}
