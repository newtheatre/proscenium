import { refusalToAct, rejectExternalForm } from '#shared/utils/external-requests'
import { formatLondon } from '#shared/utils/london'

// Turn a request down, with a reason the member is shown.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, rejectExternalForm)

  const request = await externalRequest(id)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToAct(request, 'reject')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const now = Math.floor(Date.now() / 1000)
  const moved = await moveRequest(id, ['REQUESTED', 'AWAITING_EXTERNAL'], {
    status: 'REJECTED',
    rejection_reason: input.reason,
    decided_at: now,
    decided_by: account.id,
    updated_at: now,
  })

  if (!moved) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.request.rejected',
    target: `external:${id}`,
    // The reason is the member's to read, not the trail's to keep (0011).
    detail: { was: request.status },
  }))

  await notify(event, {
    type: 'external.request.rejected',
    userId: request.userId,
    context: {
      name: request.who,
      title: request.title,
      reason: input.reason,
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms`,
    },
  })

  return { ok: true, id, status: 'REJECTED' as const }
})
