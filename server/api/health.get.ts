import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import journal from '../db/migrations/sqlite/meta/_journal.json'

/**
 * GET /api/health: uptime check. Deliberately public, monitoring holds no
 * session. 503 when the schema is behind the code (stage-door ADR-0021).
 */
export default defineEventHandler(async (event) => {
  // A failed Secrets Store read would otherwise be invisible: every session
  // reads as signed out and nothing else notices (ADR-0040).
  const sessionKey = useRuntimeConfig(event).session.password ? 'ok' : 'missing'

  const expected = journal.entries.map(entry => entry.tag)
  let pending: string[] = []

  try {
    // Raw SQL on purpose: NuxtHub owns this table, so declaring it in the
    // Drizzle schema would make `nuxt db generate` try to create it.
    const rows = await db.all<{ name: string }>(sql`select name from _hub_migrations`)
    // Production carries both spellings: `nuxt-db migrate` records the bare
    // tag, `wrangler d1 migrations apply` records it with `.sql`.
    const applied = new Set(rows.map(row => row.name.replace(/\.sql$/, '')))
    pending = expected.filter(tag => !applied.has(tag))
  }
  catch (error) {
    // No ledger table means nothing has ever been applied here.
    console.error('[health] could not read _hub_migrations:', error)
    pending = expected
  }

  if (pending.length || sessionKey === 'missing') {
    setResponseStatus(event, 503)
    return { ok: false, pendingMigrations: pending, sessionKey }
  }

  return { ok: true, sessionKey }
})
