// The applied-migrations ledger carries both spellings: `nuxt-db migrate` records the bare
// tag, `wrangler d1 migrations apply` records it with `.sql`.
export function normaliseMigrationTag(name: string): string {
  return name.replace(/\.sql$/, '')
}

// Migrations the code expects that the database has not applied. A non-empty result means the
// deploy is ahead of its schema and the health check must go red (K-107).
export function pendingMigrations(expected: string[], applied: string[]): string[] {
  const seen = new Set(applied.map(normaliseMigrationTag))
  return expected.map(normaliseMigrationTag).filter(tag => !seen.has(tag))
}
