import { performanceForm } from '#shared/utils/programme'

// Add a performance to a show. It is born DRAFT and goes on sale by its own action or by the
// show's publish cascade, never by being created (D-121 criteria 2 and 3).
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const show = await showById(showId)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const input = await readValidatedBodyOrThrow(event, performanceForm)
  const venue = (await listVenues()).find(one => one.id === input.venueId)
  if (!venue) throw createError({ statusCode: 400, statusMessage: 'No such venue' })

  const id = newId()

  await db.batch([
    db.insert(schema.performances).values({
      id,
      showId,
      venueId: input.venueId,
      startsAt: input.startsAt,
      doorsAt: input.doorsAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      intervalCount: input.intervalCount,
      intervalMinutes: input.intervalMinutes ?? null,
      capacityOverride: input.capacityOverride ?? null,
      bookingClosesHoursBefore: input.bookingClosesHoursBefore ?? null,
      notes: input.notes ?? null,
      status: 'DRAFT',
    }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.created',
      target: `performance:${id}`,
      // The night, not the day: a matinee and an evening are two records (E-127 criterion 1).
      detail: {
        showId,
        venueId: input.venueId,
        night: performanceNight(input.startsAt),
        bookingClosesHoursBefore: input.bookingClosesHoursBefore ?? null,
      },
    })),
  ])

  return { ok: true, id }
})
