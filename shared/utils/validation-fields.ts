export interface ValidationIssue { path: PropertyKey[], message: string }

// The field a failed check names, and the house message its own schema wrote for it (issue 913).
// The first issue on a field wins, so a later, less specific check cannot overwrite it.
export function fieldsFrom(issues: readonly ValidationIssue[], fallback: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : fallback
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}
