import { db, schema } from '@nuxthub/db'
import { and, eq, lt } from 'drizzle-orm'

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

    const cutoff = new Date(now.getTime() - WITHDRAWN_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const removed = await db.delete(schema.accessProfiles)
      .where(and(
        eq(schema.accessProfiles.status, 'WITHDRAWN'),
        lt(schema.accessProfiles.updatedAt, cutoff.toISOString()),
      ))
      .returning({ id: schema.accessProfiles.id })

    console.log(`[access:sweep] ${expired.length} expired, ${removed.length} withdrawn profiles removed`)
    return { result: `expired ${expired.length}, removed ${removed.length}` }
  },
})
