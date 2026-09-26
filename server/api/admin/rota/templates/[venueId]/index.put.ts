import { changes } from '#shared/utils/audit'
import { externalVenueTemplateRefusal, orderedSlots, shiftTemplateForm, templateRefusal } from '#shared/utils/rota'
import type { TemplateSlot } from '#shared/utils/rota'

// Set a venue's shift template. Editing one changes nothing already stamped: the backfill is what
// carries a change onto a performance (E-101 criterion 3). A night never stamped is stamped here.
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'venueId') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const venue = await venueById(venueId)
  if (!venue) throw noSuch('venue')
  const external = externalVenueTemplateRefusal(venue)
  if (external) throw createError({ statusCode: 409, statusMessage: external })
  // A retired venue keeps a template it already holds, for Remove, but takes no new work (D-131).
  if (venue.archived) throw createError({ statusCode: 409, statusMessage: 'That venue has been retired' })

  const input = await readValidatedBodyOrThrow(event, shiftTemplateForm)
  const refusal = templateRefusal(input.slots)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

  const held = await templateSlotsFor(venueId)
  const said = (slots: TemplateSlot[]): string =>
    orderedSlots(slots).map(slot =>
      `${slot.role}:${slot.count}:${slot.startsBeforeDoorsMinutes ?? 'default'}:${slot.endsAfterEndMinutes ?? 'default'}`).join(', ')

  const [cleared, ...written] = replaceTemplateStatements(venueId, input.slots, resolved.account.id)

  const { night, from } = stampWindow()
  const defaults = await shiftOffsetDefaults(event)

  // In the same batch, after the template rows, so a first template never leaves the imported
  // diary unstamped until somebody finds "Stamp the diary" (issue 1319).
  const results = await withShiftConstraints(() => db.batch([
    db.run(cleared),
    ...written.map(statement => db.run(statement)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: held.length === 0 ? 'shift-template.created' : 'shift-template.updated',
      target: `venue:${venueId}`,
      detail: { ...changes({ slots: [said(held), said(input.slots)] }), stampedFrom: night },
    })),
    db.all<{ id: string }>(stampUnstampedStatement(venueId, from, defaults)),
  ]))
  const stamped = results.at(-1) as { id: string }[]

  return { ok: true, slots: orderedSlots(input.slots), stamped: stamped.length }
})
