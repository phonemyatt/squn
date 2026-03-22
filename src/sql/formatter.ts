const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "AND", "OR", "INSERT", "INTO", "VALUES",
  "UPDATE", "SET", "DELETE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
  "FULL", "CROSS", "ON", "AS", "ORDER", "BY", "ASC", "DESC", "GROUP",
  "HAVING", "LIMIT", "OFFSET", "UNION", "ALL", "DISTINCT", "EXISTS",
  "IN", "NOT", "NULL", "IS", "LIKE", "BETWEEN", "CASE", "WHEN", "THEN",
  "ELSE", "END", "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "BEGIN",
  "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE", "WITH", "RETURNING",
  "OUTPUT", "MERGE", "USING", "MATCHED", "EXEC", "EXECUTE", "DECLARE",
]);

/**
 * Normalises SQL for cache keys and log output.
 * - Collapses whitespace to single spaces
 * - Uppercases SQL keywords
 * - Trims leading/trailing whitespace
 */
export function formatSql(sql: string): string {
  // Collapse all whitespace (newlines, tabs, multiple spaces) to single space
  const collapsed = sql.replace(/\s+/g, " ").trim();

  // Uppercase known SQL keywords
  return collapsed.replace(/\b([a-zA-Z_]+)\b/g, (word) => {
    if (SQL_KEYWORDS.has(word.toUpperCase())) {
      return word.toUpperCase();
    }
    return word;
  });
}
