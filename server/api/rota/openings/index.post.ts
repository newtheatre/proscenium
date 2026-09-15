import { barOpeningForm, noBarSlotsRefusal } from '#shared/utils/rota-openings'

// Plan a bar opening: an evening at a venue with nothing running, staffed from the venue's bar
// template count (E-130 criteria 1 and 2, 0077).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rota.write')
  const input = await readValidatedBodyOrThrow(event, barOpeningForm)

  const venue = await venueById(input.venueId)
  if (!venue) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

  // A venue nobody has told how many people its bar needs stamps nothing, and is told so rather
  // than given a slot the theatre never asked for (criterion 2).
  const slots = await barSlotCount(input.venueId)
  if (slots === 0) throw createError({ statusCode: 409, statusMessage: noBarSlotsRefusal(venue.name) })

  const openingId = newId()
  const [, stamped] = await withOpeningConstraints(() => db.batch([
    db.run(createOpeningStatement(openingId, input, resolved.account.id)),
    // The staffing lands in the same batch as the opening, so an opening never exists unstaffed.
    db.all<{ id: string }>(stampOpeningShiftsStatement(openingId)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar-opening.created',
      target: `bar-opening:${openingId}`,
      detail: { venueId: input.venueId, night: input.night, label: input.label },
    })),
  ]))

  return { ok: true, openingId, stamped: stamped.length }
})
