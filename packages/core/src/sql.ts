export type SqlToken = { kind: "word" | "number" | "string" | "symbol"; value: string };
export interface SelectAst { columns: string[]; table: string; where: string[]; orderBy?: { column: string; direction: "ASC" | "DESC" }; limit?: number; aggregate?: { fn: "COUNT" | "SUM" | "AVG"; column: string } }
function isLetter(value: string): boolean { return /[A-Za-z_]/.test(value) }
function isDigit(value: string): boolean { return /[0-9]/.test(value) }
export function tokenizeSql(input: string): SqlToken[] {
  const tokens: SqlToken[] = []; let i = 0;
  while (i < input.length) {
    const char = input[i]; if (char === undefined) break;
    if (/\s/.test(char)) { i += 1; continue }
    if (char === "'" || char === '"') { const quote = char; let value = ""; i += 1; while (i < input.length && input[i] !== quote) { value += input[i]; i += 1 } i += 1; tokens.push({ kind: "string", value: `${quote}${value}${quote}` }); continue }
    if (isLetter(char)) { let value = char; i += 1; while (i < input.length && (isLetter(input[i] ?? "") || isDigit(input[i] ?? "") || input[i] === ".")) { value += input[i]; i += 1 } tokens.push({ kind: "word", value }); continue }
    if (isDigit(char)) { let value = char; i += 1; while (i < input.length && isDigit(input[i] ?? "")) { value += input[i]; i += 1 } tokens.push({ kind: "number", value }); continue }
    tokens.push({ kind: "symbol", value: char }); i += 1;
  }
  return tokens;
}
function upper(value: string): string { return value.toUpperCase() }
export function parseSelect(input: string): SelectAst | null {
  const tokens = tokenizeSql(input); if (tokens.length < 4 || upper(tokens[0]?.value ?? "") !== "SELECT") return null;
  const fromIndex = tokens.findIndex((token) => upper(token.value) === "FROM"); if (fromIndex < 2 || !tokens[fromIndex + 1]) return null;
  const rawColumns = tokens.slice(1, fromIndex).map((token) => token.value).join("").split(",").map((column) => column.trim()).filter(Boolean);
  const ast: SelectAst = { columns: rawColumns, table: tokens[fromIndex + 1]!.value, where: [] };
  const whereIndex = tokens.findIndex((token, index) => index > fromIndex && upper(token.value) === "WHERE");
  const orderIndex = tokens.findIndex((token, index) => index > fromIndex && upper(token.value) === "ORDER");
  const limitIndex = tokens.findIndex((token, index) => index > fromIndex && upper(token.value) === "LIMIT");
  const whereEndCandidates = [orderIndex, limitIndex].filter((index) => index > whereIndex); const whereEnd = Math.min(...(whereEndCandidates.length ? whereEndCandidates : [tokens.length]));
  const whereTokens = whereIndex >= 0 ? tokens.slice(whereIndex + 1, whereEnd) : []; const conditions: string[] = []; let condition = "";
  for (const token of whereTokens) { if (upper(token.value) === "AND") { if (condition) conditions.push(condition.trim()); condition = "" } else condition += token.value === "=" ? " = " : `${token.value} ` }
  if (condition.trim()) conditions.push(condition.trim()); ast.where = conditions;
  if (orderIndex >= 0 && upper(tokens[orderIndex + 1]?.value ?? "") === "BY") { const column = tokens[orderIndex + 2]?.value; if (column) ast.orderBy = { column, direction: upper(tokens[orderIndex + 3]?.value ?? "ASC") === "DESC" ? "DESC" : "ASC" } }
  if (limitIndex >= 0 && tokens[limitIndex + 1]?.kind === "number") ast.limit = Number(tokens[limitIndex + 1]!.value);
  const aggregateMatch = rawColumns[0]?.match(/^(COUNT|SUM|AVG)\(([^)]+)\)$/i); if (aggregateMatch) ast.aggregate = { fn: aggregateMatch[1]!.toUpperCase() as "COUNT" | "SUM" | "AVG", column: aggregateMatch[2]! };
  return ast;
}
export function printSelect(ast: SelectAst): string { let query = `SELECT ${ast.aggregate ? `${ast.aggregate.fn}(${ast.aggregate.column})` : ast.columns.join(", ")} FROM ${ast.table}`; if (ast.where.length) query += ` WHERE ${ast.where.join(" AND ")}`; if (ast.orderBy) query += ` ORDER BY ${ast.orderBy.column} ${ast.orderBy.direction}`; if (ast.limit !== undefined) query += ` LIMIT ${ast.limit}`; return `${query};` }
