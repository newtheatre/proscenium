import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { pendingMigrations } from '../../shared/migrations'
import journal from '../db/migrations/sqlite/meta/_journal.json'

// Deliberately public: monitoring holds no session. 503 whenever the schema is behind the
// code, naming the pending files (K-107).
export default defineEventHandler(async (event) => {
  // A failed Secrets Store read would otherwise be invisible: every session reads as signed
  // out and nothing else notices (0007).
  const sessionKey = useRuntimeConfig(event).session.password ? 'ok' : 'missing'

  const expected = journal.entries.map((entry: { tag: string }) => entry.tag)
  let pending: string[]

  try {
    // Raw SQL on purpose: NuxtHub owns this table, so declaring it in the Drizzle schema
    // would make `nuxt db generate` try to create it.
    const rows = await db.all<{ name: string }>(sql`select name from _hub_migrations`)
    pending = pendingMigrations(expected, rows.map(row => row.name))
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
