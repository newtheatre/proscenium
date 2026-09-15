import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal } from '#shared/utils/rota'

// Approve a queued claim on a bar opening. The predicate rides the write, so two officers
// deciding at once confirm it once between them (E-130 criterion 3, 0003).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingShiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such bar opening slot' })

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.confirmed',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'CONFIRMED'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(approveOpeningShiftStatement(id)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: approvalRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.approved',
      context: {
        name: '',
        show: held.label,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: 'bar',
      },
    })
  }

  return { ok: true, status: 'CONFIRMED' }
})
