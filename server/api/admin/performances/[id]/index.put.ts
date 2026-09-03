import { eq } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { performanceForm } from '#shared/utils/programme'

// Edit a performance: its venue, its times, its capacity and its booking window. It does not take
// the status, which moves by its own actions (D-112 criterion 1, D-121 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const input = await readValidatedBodyOrThrow(event, performanceForm)
  const venue = (await listVenues()).find(one => one.id === input.venueId)
  if (!venue) throw createError({ statusCode: 400, statusMessage: 'No such venue' })

  // Lowering capacity below what is already sold is D-105's refusal, quoting both figures. It has
  // nothing to compare against until tickets exist, so the count is checked and the story cited.
  if (input.capacityOverride != null && input.capacityOverride < held.soldTickets) {
    throw createError({
      statusCode: 409,
      statusMessage: `${plural(held.soldTickets, 'ticket')} are already held on this performance, so its capacity cannot be set to ${input.capacityOverride}`,
    })
  }

  const window = input.bookingClosesHoursBefore ?? null

  await db.batch([
    db.update(schema.performances).set({
      venueId: input.venueId,
      startsAt: input.startsAt,
      doorsAt: input.doorsAt ?? null,
      durationMinutes: input.durationMinutes ?? null,
      intervalCount: input.intervalCount,
      intervalMinutes: input.intervalMinutes ?? null,
      capacityOverride: input.capacityOverride ?? null,
      bookingClosesHoursBefore: window,
      notes: input.notes ?? null,
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(schema.performances.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'performance.updated',
      target: `performance:${id}`,
      detail: {
        ...changes({
          venueId: [held.venueId, input.venueId],
          night: [performanceNight(held.startsAt), performanceNight(input.startsAt)],
          startsAt: [held.startsAt, input.startsAt],
          capacityOverride: [held.capacityOverride, input.capacityOverride ?? null],
          bookingClosesHoursBefore: [held.bookingClosesHoursBefore, window],
        }),
        // Internal prose stays on the record; the trail records only that it moved (0011).
        notesChanged: (input.notes ?? null) !== held.notes,
      },
    })),
  ])

  return { ok: true }
})
