import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { performanceForm } from '#shared/utils/programme'
import { COMMITTED_SHIFT_STATUSES, saysShiftRole } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'

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

  // The capacity that will apply, so clearing the override or moving to a smaller venue is checked
  // as well as lowering the number. Refusing quotes both figures (D-105 criterion 4).
  const capacity = input.capacityOverride ?? venue.capacity
  const refusal = loweringRefusal(capacity, held.soldTickets)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const window = input.bookingClosesHoursBefore ?? null

  // Moving a house means moving the rota: a held shift travels, an open one is restamped fresh.
  // A held shift in a role the new venue does not staff at all cannot travel, so it is cancelled.
  const moved = input.venueId !== held.venueId
  const active = moved ? await activeShifts(id) : []
  const heldShifts = active.filter(shift => COMMITTED_SHIFT_STATUSES.includes(shift.status) && shift.userId !== null)
  const newRoles = moved ? new Set((await templateSlotsFor(input.venueId)).map(slot => slot.role)) : new Set<ShiftRole>()
  const orphaned = heldShifts.filter(shift => !newRoles.has(shift.role))
  const carried = heldShifts.filter(shift => newRoles.has(shift.role))

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'performance.updated',
    target: `performance:${id}`,
    detail: {
      ...changes({
        venueId: [held.venueId, input.venueId],
        night: [performanceNight(held.startsAt), performanceNight(input.startsAt)],
        startsAt: [held.startsAt, input.startsAt],
        capacityOverride: [held.capacityOverride, input.capacityOverride ?? null],
        effectiveCapacity: [effectiveCapacity(held), capacity],
        bookingClosesHoursBefore: [held.bookingClosesHoursBefore, window],
      }),
      // Internal prose stays on the record; the trail records only that it moved (0011).
      notesChanged: (input.notes ?? null) !== held.notes,
      ...(moved ? { shiftsMoved: carried.length, shiftsDropped: orphaned.length } : {}),
    },
  })

  // The capacity check rides the UPDATE, so a booking landing after the read above cannot slip
  // under the new capacity; the audit reads `changes()`, so a refused edit writes no trail (0003).
  const [updated] = await db.batch([
    db.all<{ id: string }>(sql`
      UPDATE performances
      SET venue_id = ${input.venueId},
          starts_at = ${input.startsAt},
          doors_at = ${input.doorsAt ?? null},
          duration_minutes = ${input.durationMinutes ?? null},
          interval_count = ${input.intervalCount},
          interval_minutes = ${input.intervalMinutes ?? null},
          capacity_override = ${input.capacityOverride ?? null},
          booking_closes_hours_before = ${window},
          notes = ${input.notes ?? null},
          updated_at = unixepoch()
      WHERE id = ${id} AND ${loweringPredicate(id, capacity)}
      RETURNING id
    `),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ])

  if (updated.length === 0) {
    const now = await performanceById(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
    throw createError({
      statusCode: 409,
      statusMessage: loweringRefusal(capacity, now.soldTickets) ?? 'That performance changed while you were editing it',
    })
  }

  // Only once the move is real: restamping a rota for an edit that was refused would cancel held
  // shifts against a venue the performance never went to.
  if (moved) {
    await db.batch([
      db.run(cancelOrphanedShiftsStatement(id, input.venueId)),
      db.run(clearOpenShiftsStatement(id)),
      db.run(stampPerformanceStatement(id)),
    ])
  }

  // The batch committed, so every holder below is real: tell them after, never before (0003).
  if (moved) {
    const when = formatLondon(new Date(input.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })

    for (const shift of carried) {
      const took = await claimNotification({
        userId: shift.userId!,
        type: 'shift.venue-changed',
        key: `shift.venue-changed:${shift.shiftId}:${input.venueId}`,
      })
      if (!took) continue

      await notify(event, {
        userId: shift.userId!,
        type: 'shift.venue-changed',
        context: {
          name: '',
          show: held.showTitle,
          oldVenue: held.venueName,
          newVenue: venue.name,
          when,
          role: saysShiftRole(shift.role).toLowerCase(),
        },
      })
    }

    for (const shift of orphaned) {
      const took = await claimNotification({
        userId: shift.userId!,
        type: 'shift.role-not-needed',
        key: `shift.role-not-needed:${shift.shiftId}:${input.venueId}`,
      })
      if (!took) continue

      await notify(event, {
        userId: shift.userId!,
        type: 'shift.role-not-needed',
        context: {
          name: '',
          show: held.showTitle,
          newVenue: venue.name,
          when,
          role: saysShiftRole(shift.role).toLowerCase(),
        },
      })
    }
  }

  return { ok: true }
})
