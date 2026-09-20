export type SqlToken = { kind: "word" | "number" | "string" | "symbol"; value: string };
export interface SelectAst { columns: string[]; table: string; where: string[]; orderBy?: { column: string; direction: "ASC" | "DESC" }; limit?: number; aggregate?: { fn: "COUNT" | "SUM" | "AVG"; column: string } }

function isLetter(value: string): boolean { return /[A-Za-z_]/.test(value) }
function isDigit(value: string): boolean { return /[0-9]/.test(value) }
function upper(value: string): string { return value.toUpperCase() }
function isIdentifier(value: string): boolean { return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value) }

export function tokenizeSql(input: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === undefined) break;
    if (/\s/.test(char)) { i += 1; continue }
    if (char === "'" || char === '"') {
      const quote = char;
      let value = "";
      i += 1;
      while (i < input.length) {
        const next = input[i];
        if (next === undefined) break;
        if (next === quote && input[i + 1] === quote) { value += `${quote}${quote}`; i += 2; continue }
        if (next === quote) break;
        value += next;
        i += 1;
      }
      if (input[i] !== quote) return [];
      i += 1;
      tokens.push({ kind: "string", value: `${quote}${value}${quote}` });
      continue;
    }
    if (isLetter(char)) {
      let value = char;
      i += 1;
      while (i < input.length && (isLetter(input[i] ?? "") || isDigit(input[i] ?? "") || input[i] === ".")) { value += input[i]; i += 1 }
      tokens.push({ kind: "word", value });
      continue;
    }
    if (isDigit(char)) {
      let value = char;
      i += 1;
      while (i < input.length && /[0-9.]/.test(input[i] ?? "")) { value += input[i]; i += 1 }
      tokens.push({ kind: "number", value });
      continue;
    }
    if (char === "-" && input[i + 1] === "-") return [];
    if (char === "/" && input[i + 1] === "*") return [];
    const pair = `${char}${input[i + 1] ?? ""}`;
    if (["<=", ">=", "<>", "!="].includes(pair)) { tokens.push({ kind: "symbol", value: pair }); i += 2; continue }
    tokens.push({ kind: "symbol", value: char });
    i += 1;
  }
  return tokens;
}

function splitByComma(tokens: SqlToken[]): SqlToken[][] {
  const groups: SqlToken[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.value === "(") depth += 1;
    if (token.value === ")") depth -= 1;
    if (token.value === "," && depth === 0) groups.push([]);
    else groups.at(-1)!.push(token);
  }
  return groups;
}

function tokensToCondition(tokens: SqlToken[]): string | null {
  if (!tokens.length) return null;
  let value = "";
  for (const token of tokens) value += token.value === "=" || ["<", ">", "<=", ">=", "<>", "!="].includes(token.value) ? ` ${token.value} ` : `${token.value} `;
  const condition = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_.]*\s*(?:=|<>|!=|<=|>=|<|>|LIKE|IS|IN)\s*[A-Za-z0-9_.'"()%,+*/ -]+$/i.test(condition)) return null;
  return condition;
}

export function parseSelect(input: string): SelectAst | null {
  const tokens = tokenizeSql(input);
  if (tokens.length < 4 || upper(tokens[0]?.value ?? "") !== "SELECT") return null;
  if (tokens.at(-1)?.value === ";") tokens.pop();
  if (tokens.some((token) => token.value === ";")) return null;
  if (tokens.some((token) => ["UNION", "INTERSECT", "EXCEPT", "JOIN", "WITH", "OFFSET", "GROUP", "HAVING"].includes(upper(token.value)))) return null;

  const fromIndex = tokens.findIndex((token) => upper(token.value) === "FROM");
  if (fromIndex < 2 || !tokens[fromIndex + 1] || !isIdentifier(tokens[fromIndex + 1]!.value)) return null;
  const columnGroups = splitByComma(tokens.slice(1, fromIndex));
  const columns = columnGroups.map((group) => group.map((token) => token.value).join("").trim());
  if (!columns.length || columns.some((column) => column !== "*" && !isIdentifier(column) && !/^(COUNT|SUM|AVG)\([A-Za-z_][A-Za-z0-9_.]*\)$/i.test(column))) return null;
  const ast: SelectAst = { columns, table: tokens[fromIndex + 1]!.value, where: [] };
  let cursor = fromIndex + 2;
  const nextClause = (start: number): number => {
    const clauses = ["WHERE", "ORDER", "LIMIT"];
    const index = tokens.findIndex((token, position) => position >= start && clauses.includes(upper(token.value)));
    return index < 0 ? tokens.length : index;
  };

  if (upper(tokens[cursor]?.value ?? "") === "WHERE") {
    const end = nextClause(cursor + 1);
    const conditions: string[] = [];
    let current: SqlToken[] = [];
    for (const token of tokens.slice(cursor + 1, end)) {
      if (upper(token.value) === "AND") { const condition = tokensToCondition(current); if (!condition) return null; conditions.push(condition); current = [] }
      else current.push(token);
    }
    const finalCondition = tokensToCondition(current);
    if (!finalCondition) return null;
    conditions.push(finalCondition);
    ast.where = conditions;
    cursor = end;
  }
  if (upper(tokens[cursor]?.value ?? "") === "ORDER") {
    if (upper(tokens[cursor + 1]?.value ?? "") !== "BY" || !isIdentifier(tokens[cursor + 2]?.value ?? "")) return null;
    const direction = upper(tokens[cursor + 3]?.value ?? "ASC");
    if (direction !== "ASC" && direction !== "DESC") return null;
    ast.orderBy = { column: tokens[cursor + 2]!.value, direction };
    cursor += 4;
  }
  if (upper(tokens[cursor]?.value ?? "") === "LIMIT") {
    if (tokens[cursor + 1]?.kind !== "number" || !/^\d+$/.test(tokens[cursor + 1]!.value)) return null;
    ast.limit = Number(tokens[cursor + 1]!.value);
    cursor += 2;
  }
  if (cursor !== tokens.length) return null;
  const aggregateMatch = columns[0]?.match(/^(COUNT|SUM|AVG)\(([A-Za-z_][A-Za-z0-9_.]*)\)$/i);
  if (aggregateMatch) ast.aggregate = { fn: aggregateMatch[1]!.toUpperCase() as "COUNT" | "SUM" | "AVG", column: aggregateMatch[2]! };
  return ast;
}

export function printSelect(ast: SelectAst): string {
  let query = `SELECT ${ast.aggregate ? `${ast.aggregate.fn}(${ast.aggregate.column})` : ast.columns.join(", ")} FROM ${ast.table}`;
  if (ast.where.length) query += ` WHERE ${ast.where.join(" AND ")}`;
  if (ast.orderBy) query += ` ORDER BY ${ast.orderBy.column} ${ast.orderBy.direction}`;
  if (ast.limit !== undefined) query += ` LIMIT ${ast.limit}`;
  return `${query};`;
}
