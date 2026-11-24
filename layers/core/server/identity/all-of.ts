// SQLite refuses an expression more than 100 deep, and `a AND b AND c ...` nests one level per term,
// so a check over every table in the registry is joined as a balanced tree instead.
export function allOf(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '1'
  const half = Math.ceil(parts.length / 2) // not-policy: halving
  return `(${allOf(parts.slice(0, half))}) AND (${allOf(parts.slice(half))})`
}
