import { performanceRunForm } from '#shared/utils/programme'

// Add a run: every night of it or none, each born DRAFT and stamped from its venue's template in
// the same batch as the others (D-132 criterion 10, D-121 criteria 2 and 3, E-102 criterion 1).
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const show = await showById(showId)
  if (!show) throw noSuch('show')

  const input = await readValidatedBodyOrThrow(event, performanceRunForm)
  await bookableVenueOrThrow(input.venueId, input.durationMinutes)

  const offsets = await shiftOffsetDefaults(event)
  const nights = input.nights.map(night => ({ ...night, id: newId() }))

  await db.batch(nights.flatMap(night => [
    db.insert(schema.performances).values({
      id: night.id,
      showId,
      venueId: input.venueId,
      startsAt: night.startsAt,
      doorsAt: night.doorsAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      intervalCount: input.intervalCount,
      intervalMinutes: input.intervalMinutes ?? null,
      status: 'DRAFT',
    }),
    db.run(stampPerformanceStatement(night.id, offsets)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.created',
      target: `performance:${night.id}`,
      // The night, not the day: a matinee and an evening are two records (E-127 criterion 1).
      detail: { showId, venueId: input.venueId, night: performanceNight(night.startsAt), bookingClosesHoursBefore: null },
    })),
  ]) as unknown as Parameters<typeof db.batch>[0])

  return { ok: true, ids: nights.map(night => night.id) }
})
