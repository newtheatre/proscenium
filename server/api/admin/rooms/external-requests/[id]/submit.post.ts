import { refusalToAct, submitForm } from '#shared/utils/external-requests'
import { formatLondon } from '#shared/utils/london'

// Record that the union's form is in.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, submitForm)

  const request = await externalRequest(id)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToAct(request, 'submit')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const now = Math.floor(Date.now() / 1000)
  const moved = await moveRequest(id, ['REQUESTED'], {
    status: 'AWAITING_EXTERNAL',
    submitted_at: now,
    submitted_by: account.id,
    // Cleared, or a request chased while it waited for the form can never be chased again once
    // the form is in, which is the half of the wait actually worth chasing.
    escalated_at: null,
    su_reference: input.suReference,
    updated_at: now,
  })

  if (!moved) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.request.submitted',
    target: `external:${id}`,
    // Whether they gave us a reference, never its text: audit detail is append-only, and free
    // text an officer typed cannot be corrected or erased later (0010, 0011).
    detail: { referenced: input.suReference !== null },
  }))

  await notify(event, {
    type: 'external.request.submitted',
    userId: request.userId,
    context: {
      name: request.who,
      title: request.title,
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, status: 'AWAITING_EXTERNAL' as const }
})
