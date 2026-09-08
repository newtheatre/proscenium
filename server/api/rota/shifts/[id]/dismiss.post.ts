import { changes } from '#shared/utils/audit'
import { dismissRefusal } from '#shared/utils/rota'

// Clear a declined claim off your own "what you hold" list. Cancelled, not deleted, the same
// terminal state E-107's reassignment already leaves (E-114).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })
  if (held.userId !== account.id) throw createError({ statusCode: 403, statusMessage: 'That is not your shift to dismiss' })
  if (held.status !== 'DECLINED') throw createError({ statusCode: 409, statusMessage: dismissRefusal() })

  const entry = auditEntry({
    actorId: account.id,
    action: 'shift.dismissed',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, 'CANCELLED'] }),
  })

  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(dismissShiftStatement(id, account.id)), entry))
  if (!applied) throw createError({ statusCode: 409, statusMessage: dismissRefusal() })

  return { ok: true, status: 'CANCELLED' }
})
