import { changes } from '#shared/utils/audit'
import { orderedSlots, shiftTemplateForm, templateRefusal } from '#shared/utils/rota'
import type { TemplateSlot } from '#shared/utils/rota'

// Set a venue's shift template. Editing one changes nothing already stamped: the backfill is what
// carries a change onto a performance (E-101 criterion 3).
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'venueId') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const venue = (await listVenues()).find(one => one.id === venueId)
  if (!venue) throw createError({ statusCode: 404, statusMessage: 'No such venue' })

  const input = await readValidatedBodyOrThrow(event, shiftTemplateForm)
  const refusal = templateRefusal(input.slots)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

  const held = await templateSlotsFor(venueId)
  const said = (slots: TemplateSlot[]): string =>
    orderedSlots(slots).map(slot => `${slot.role}:${slot.count}`).join(', ')

  const [cleared, ...written] = replaceTemplateStatements(venueId, input.slots, resolved.account.id)

  await withShiftConstraints(() => db.batch([
    db.run(cleared),
    ...written.map(statement => db.run(statement)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: held.length === 0 ? 'shift-template.created' : 'shift-template.updated',
      target: `venue:${venueId}`,
      detail: changes({ slots: [said(held), said(input.slots)] }),
    })),
  ]))

  return { ok: true, slots: orderedSlots(input.slots) }
})
