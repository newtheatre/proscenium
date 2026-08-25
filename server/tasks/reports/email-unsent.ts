import { db, schema } from '@nuxthub/db'
import { and, asc, gte, isNull, lt } from 'drizzle-orm'

/**
 * Re-sends the courtesy copy of a report whose email never went out, so
 * `emailed_at is null` is a queue rather than a dead end (docs/12 §4.2).
 */
export default defineTask({
  meta: {
    name: 'reports:email-unsent',
    description: 'Re-send end-of-night reports that were stored but never emailed',
  },
  async run() {
    // Recent nights only, and bounded: a decade of imported performances has no
    // report at all, and a dead address must not be retried for ever.
    const since = londonDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    // Nights before today, so this never races the close that is emailing now:
    // tasks sharing a cron run together, not in order.
    const today = londonDate()

    const unsent = await db.select({
      id: schema.performanceReports.id,
      payload: schema.performanceReports.payload,
      autoClosed: schema.performanceReports.autoClosed,
    })
      .from(schema.performanceReports)
      .where(and(
        isNull(schema.performanceReports.emailedAt),
        gte(schema.performanceReports.night, since),
        lt(schema.performanceReports.night, today),
      ))
      .orderBy(asc(schema.performanceReports.night))
      .limit(20)

    let sent = 0
    for (const report of unsent) {
      try {
        // Stamps `emailed_at` itself, so a report that goes out is not retried.
        if (await emailNightReport(report.id, report.payload, report.autoClosed)) sent++
      }
      catch (error) {
        console.error(`[reports:email-unsent] ${report.id}:`, error)
      }
    }

    console.log(`[reports:email-unsent] emailed ${sent} of ${unsent.length} unsent reports`)
    return { result: `sent ${sent}` }
  },
})
