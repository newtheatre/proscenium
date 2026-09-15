import { changes } from '#shared/utils/audit'
import { releaseRefusal } from '#shared/utils/rota'

// The holder's own release, the same self-service a shift has (E-107 criterion 1): the slot goes
// back on the open list naming nobody, and the officer is not in the way of it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await openingShiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such bar opening slot' })
  if (held.userId !== account.id) throw createError({ statusCode: 403, statusMessage: 'That slot is not yours to release' })

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar-opening-shift.released',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'OPEN'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(releaseOpeningShiftStatement(id, account.id)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: releaseRefusal(now?.status ?? held.status) })
  }

  return { ok: true, status: 'OPEN' }
})
