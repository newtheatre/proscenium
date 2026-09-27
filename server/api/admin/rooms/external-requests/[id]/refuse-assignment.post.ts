import { refusalToAct, refuseAssignmentForm } from '#shared/utils/external-requests'
import { formatLondon } from '#shared/utils/london'

// We were given something unsuitable, so we record it and ask again.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, refuseAssignmentForm)

  const request = await externalRequest(id)
  if (!request) throw noSuch('request')

  const refusal = refusalToAct(request, 'refuse-assignment')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const space = await findSpace(input.spaceId)
  if (!space) throw createError({ statusCode: 422, statusMessage: 'That room is not one we have listed' })

  const now = Math.floor(Date.now() / 1000)

  const refused = auditEntry({
    actorId: account.id,
    action: 'external.request.assignment.refused',
    target: `external:${id}`,
    detail: { space: space.id, noted: input.note?.verdict ?? null },
  })
  // Written in the same action, so the blacklist builds itself out of the work, and audited like
  // the peer route that makes the same change (C-119).
  const noted = input.note
    ? {
        note: {
          id: newId(),
          spaceId: space.id,
          purpose: request.purpose,
          verdict: input.note.verdict,
          reason: input.note.reason,
          writtenBy: account.id,
          now,
        },
        entry: auditEntry({
          actorId: account.id,
          action: 'external.space.note.set',
          target: `space:${space.id}`,
          detail: { space: space.id, purpose: request.purpose, verdict: input.note.verdict },
        }),
      }
    : null

  // Guarded, or a refusal lands against a request a colleague just confirmed (0006).
  const statements = refuseAssignmentStatements({
    id: newId(),
    requestId: id,
    spaceId: space.id,
    outcome: 'REFUSED',
    reason: input.reason,
    recordedBy: account.id,
    recordedAt: now,
  }, refused, noted)
  const [still] = await runBatch(statements)
  if (!still!.length) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

  await notify(event, {
    type: 'external.request.reassigning',
    userId: request.userId,
    context: {
      name: request.who,
      title: request.title,
      room: space.name,
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, status: 'AWAITING_EXTERNAL', askedAgain: true }
})
