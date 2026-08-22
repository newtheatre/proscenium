import { db, schema } from '@nuxthub/db'
import { and, eq, gte, lte, ne } from 'drizzle-orm'

/**
 * Reminds everyone confirmed on a performance tomorrow. Idempotent by day:
 * running it twice sends twice, so it is scheduled once (docs/08 §4a).
 */
export default defineTask({
  meta: {
    name: 'shifts:remind',
    description: 'Email everyone confirmed on tomorrow\'s performances, with an ICS',
  },
  async run() {
    const tomorrow = showNightDate(new Date(Date.now() + 24 * 60 * 60 * 1000))

    const rows = await db.select({
      shiftId: schema.performanceShifts.id,
      role: schema.performanceShifts.role,
      name: schema.users.name,
      email: schema.users.email,
      anonymisedAt: schema.users.anonymisedAt,
      startsAt: schema.performances.startsAt,
      doorsAt: schema.performances.doorsAt,
      durationMinutes: schema.performances.durationMinutes,
      showTitle: schema.shows.title,
      venueName: schema.venues.name,
      venueAddress: schema.venues.address,
    })
      .from(schema.performanceShifts)
      .innerJoin(schema.users, eq(schema.performanceShifts.userId, schema.users.id))
      .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
      .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
      .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
      .where(and(
      // No reminder for a venue we do not run (ADR-0029).
        ourBuildingPredicate(),
        eq(schema.performanceShifts.status, 'CONFIRMED'),
        gte(schema.performances.startsAt, validityStart(tomorrow)),
        lte(schema.performances.startsAt, validityEnd(tomorrow)),
        ne(schema.performances.status, 'CANCELLED'),
      ))

    let sent = 0
    for (const row of rows) {
      // An erased account keeps its shift as a record but must not be emailed.
      if (row.anonymisedAt) continue

      const ends = new Date(row.startsAt.getTime() + (row.durationMinutes ?? 150) * 60 * 1000)
      const starts = row.doorsAt ?? new Date(row.startsAt.getTime() - 45 * 60 * 1000)

      try {
        await sendShiftReminderEmail({
          to: row.email,
          name: row.name,
          role: row.role.replace('_', ' '),
          showTitle: row.showTitle,
          venueName: row.venueName,
          startsAt: row.startsAt,
          doorsAt: row.doorsAt,
          ics: shiftIcs({
            uid: `shift-${row.shiftId}@newtheatre.org.uk`,
            startsAt: starts,
            endsAt: ends,
            summary: `${row.role.replace('_', ' ')}, ${row.showTitle}`,
            description: `Front of house at the Nottingham New Theatre.`,
            location: row.venueAddress ?? row.venueName,
            url: `${useRuntimeConfig().public.baseURL}/account/shifts`,
          }),
        })
        sent++
      }
      catch (error) {
        // One bad address must not stop the rest of the rota being reminded.
        console.error(`[shifts:remind] could not email ${row.email}:`, error)
      }
    }

    console.log(`[shifts:remind] ${sent} of ${rows.length} reminders sent for ${tomorrow}`)
    return { result: `sent ${sent}` }
  },
})
