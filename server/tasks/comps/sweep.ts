import { db, schema } from '@nuxthub/db'
import { and, eq, lt, sql } from 'drizzle-orm'

/**
 * Tidiness only: expiry is derived at read and refused at approve, so a missed
 * run cannot make a stale request approvable (docs/13 §4.1.2).
 */
export default defineTask({
  meta: {
    name: 'comps:sweep',
    description: 'Mark comp requests nobody answered as expired',
  },
  async run() {
    const expired = await db.update(schema.compRequests)
      .set({ status: 'EXPIRED' })
      .where(and(
        eq(schema.compRequests.status, 'PENDING'),
        lt(schema.compRequests.requestedAt, sql`datetime('now', '-${sql.raw(String(COMP_WINDOW_MINUTES))} minutes')`),
      ))
      .returning({ id: schema.compRequests.id })

    console.log(`[comps:sweep] expired ${expired.length} unanswered comp requests`)
    return { result: `expired ${expired.length}` }
  },
})
