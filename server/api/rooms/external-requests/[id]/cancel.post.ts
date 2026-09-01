import { refusalToAct } from '#shared/utils/external-requests'
import { formatLondon } from '#shared/utils/london'

// Withdraw a union room you asked for.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id') ?? ''

  const request = await externalRequest(id)
  // The same answer for one that is not yours and one that is not there.
  if (!request || request.userId !== account.id) {
    throw createError({ statusCode: 404, statusMessage: 'That is not your request' })
  }

  const refusal = refusalToAct(request, 'cancel')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const now = Math.floor(Date.now() / 1000)
  const cancelling = { status: 'CANCELLED', updated_at: now }

  // Two guarded attempts rather than one, because whether the union already holds this decides
  // who gets told, and a submit landing between the read and the write would make a read lie.
  const withUnion = await moveRequest(id, ['AWAITING_EXTERNAL', 'CONFIRMED'], cancelling)
  const moved = withUnion || await moveRequest(id, ['REQUESTED'], cancelling)

  if (!moved) throw createError({ statusCode: 409, statusMessage: 'That request has already been decided' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.request.cancelled',
    target: `external:${id}`,
    detail: { was: request.status },
  }))

  // The approvers are told whenever the union already has it, because our arrangement with them
  // stands until a person withdraws it (C-112 criterion 3).
  if (withUnion) {
    for (const approver of await approvers()) {
      await notify(event, {
        type: 'external.request.withdrawn',
        userId: approver.id,
        context: {
          name: approver.name,
          who: request.who,
          title: request.title,
          room: request.assigned ?? request.preferred ?? 'no room yet',
          reference: request.suReference ?? 'none recorded',
          when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        },
      })
    }
  }

  return { ok: true, id, status: 'CANCELLED' as const, unionTold: withUnion }
})
