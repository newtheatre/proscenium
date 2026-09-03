import { sql } from 'drizzle-orm'
import { orderedSlots } from '#shared/utils/rota'

// Take a venue's template away. Its performances then stamp nothing and show as unstaffed, which
// is the visible failure E-101 criterion 4 asks for rather than a silent one.
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'venueId') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await templateSlotsFor(venueId)
  if (held.length === 0) throw createError({ statusCode: 404, statusMessage: 'This venue has no template' })

  await db.batch([
    db.run(sql`DELETE FROM shift_templates WHERE venue_id = ${venueId}`),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'shift-template.removed',
      target: `venue:${venueId}`,
      detail: { slots: orderedSlots(held).map(slot => `${slot.role}:${slot.count}`).join(', ') },
    })),
  ])

  return { ok: true }
})
