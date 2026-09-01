import { refusalToAct, refuseAssignmentForm } from '#shared/utils/external-requests'
import { formatLondon } from '#shared/utils/london'

// The union gave us something unsuitable, so we record it and ask again.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, refuseAssignmentForm)

  const request = await externalRequest(id)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToAct(request, 'refuse-assignment')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const space = await findSpace(input.spaceId)
  if (!space) throw createError({ statusCode: 422, statusMessage: 'That room is not one the union lists' })

  const now = Math.floor(Date.now() / 1000)

  // Guarded, or a refusal lands against a request a colleague just confirmed (0006). A room
  // refused after confirming is still a room we no longer have, so it goes back to the union.
  const still = await moveRequest(id, ['AWAITING_EXTERNAL', 'CONFIRMED'], {
    status: 'AWAITING_EXTERNAL',
    assigned_space_id: null,
    updated_at: now,
  })
  if (!still) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

  await db.insert(schema.externalAssignments).values({
    id: newId(),
    requestId: id,
    spaceId: space.id,
    outcome: 'REFUSED',
    reason: input.reason,
    recordedBy: account.id,
    recordedAt: now,
  })

  // Written in the same action, so the blacklist builds itself out of the work rather than
  // being a chore somebody remembers to do afterwards (C-119).
  if (input.note) {
    await db.insert(schema.externalSpaceNotes)
      .values({
        id: newId(),
        spaceId: space.id,
        purpose: request.purpose,
        verdict: input.note.verdict,
        reason: input.note.reason,
        writtenBy: account.id,
      })
      .onConflictDoUpdate({
        target: [schema.externalSpaceNotes.spaceId, schema.externalSpaceNotes.purpose],
        set: { verdict: input.note.verdict, reason: input.note.reason, writtenBy: account.id, updatedAt: now },
      })
  }

  const entries = [auditEntry({
    actorId: account.id,
    action: 'external.request.assignment.refused',
    target: `external:${id}`,
    detail: { space: space.id, noted: input.note?.verdict ?? null },
  })]

  // Audited like the peer route that makes the same change: a privileged mutation may not lose
  // its trail entry by being reached from a different screen (CLAUDE.md).
  if (input.note) {
    entries.push(auditEntry({
      actorId: account.id,
      action: 'external.space.note.set',
      target: `space:${space.id}`,
      detail: { space: space.id, purpose: request.purpose, verdict: input.note.verdict },
    }))
  }

  await db.insert(schema.auditLog).values(entries)

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
