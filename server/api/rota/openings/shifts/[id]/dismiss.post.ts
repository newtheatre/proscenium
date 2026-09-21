import { changes } from '#shared/utils/audit'
import { dismissRefusal } from '#shared/utils/rota'

// A member clearing their own declined claim off their rota (E-114): the slot returns to open
// naming nobody, exactly as a release leaves one.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar-opening-shift.dismissed',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'OPEN'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(dismissOpeningShiftStatement(id, account.id)), entry))

  if (!applied) throw createError({ statusCode: 409, statusMessage: dismissRefusal() })

  return { ok: true, status: 'OPEN' }
})
