import { db, schema } from '@nuxthub/db'
import { and, eq, lt, sql } from 'drizzle-orm'

/** A withdrawn profile is a tombstone; it does not need to be one forever. */
const WITHDRAWN_RETENTION_DAYS = 30

export default defineTask({
  meta: {
    name: 'access:sweep',
    description: 'Expire access profiles past their date, and clear old withdrawals (docs/12 §2.5)',
  },
  async run() {
    const now = new Date()

    // Expiry follows the card's own three-year cycle, so this is ordinary
    // housekeeping rather than a deletion: the person can renew.
    const expired = await db.update(schema.accessProfiles)
      .set({ status: 'EXPIRED' })
      .where(and(
        eq(schema.accessProfiles.status, 'VERIFIED'),
        lt(schema.accessProfiles.expiresAt, now),
      ))
      .returning({ id: schema.accessProfiles.id })

    const removed = await db.delete(schema.accessProfiles)
      .where(and(
        eq(schema.accessProfiles.status, 'WITHDRAWN'),
        // The column holds `YYYY-MM-DD HH:MM:SS` from current_timestamp, and a
        // TEXT compare against an ISO string sorts ' ' before 'T' (ADR-0023).
        lt(schema.accessProfiles.updatedAt, sql`datetime('now', ${`-${WITHDRAWN_RETENTION_DAYS} days`})`),
      ))
      .returning({ id: schema.accessProfiles.id })

    console.log(`[access:sweep] ${expired.length} expired, ${removed.length} withdrawn profiles removed`)
    return { result: `expired ${expired.length}, removed ${removed.length}` }
  },
})
