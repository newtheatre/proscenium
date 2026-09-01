import { assignForm, refusalToAct } from '#shared/utils/external-requests'
import { blocksAssignment, noteFor, warningFor } from '#shared/utils/external-spaces'
import { formatLondon } from '#shared/utils/london'

// Record the room the union gave us, which confirms the request.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, assignForm)

  const request = await externalRequest(id)
  if (!request) throw createError({ statusCode: 404, statusMessage: 'No such request' })

  const refusal = refusalToAct(request, 'assign')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const space = await findSpace(input.spaceId)
  if (!space) throw createError({ statusCode: 422, statusMessage: 'That room is not one the union lists' })

  // The spreadsheet check, made into a refusal. A warning here would be read past, and the whole
  // complaint is that nobody knew the room was wrong until they turned up to it (C-120).
  const note = noteFor(await notesFor({ spaceIds: [space.id], purpose: request.purpose }), space.id, request.purpose)
  if (blocksAssignment(note) && !input.despite) {
    throw createError({
      statusCode: 409,
      statusMessage: warningFor(note) ?? 'That room is no good for this',
      data: { note: { verdict: note!.verdict, reason: note!.reason }, needsDespite: true },
    })
  }

  const now = Math.floor(Date.now() / 1000)
  // From CONFIRMED too, and guarded on both: the union moving us room to room after answering is
  // ordinary, and the room they gave us has to be correctable (0006, C-120).
  const moved = await moveRequest(id, ['AWAITING_EXTERNAL', 'CONFIRMED'], {
    status: 'CONFIRMED',
    assigned_space_id: space.id,
    su_reference: input.suReference ?? request.suReference,
    decided_at: now,
    decided_by: account.id,
    updated_at: now,
  })

  if (!moved) throw createError({ statusCode: 409, statusMessage: 'That request has already moved on' })

  // Every room the union offered, kept: asking again must not overwrite what we were given first.
  await db.insert(schema.externalAssignments).values({
    id: newId(),
    requestId: id,
    spaceId: space.id,
    outcome: 'ACCEPTED',
    reason: input.despite && note ? 'Accepted despite what we know about it' : null,
    recordedBy: account.id,
    recordedAt: now,
  })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.request.assigned',
    target: `external:${id}`,
    // That a note existed and was overridden, never its wording (0011).
    detail: { space: space.id, overrode: blocksAssignment(note) },
  }))

  await notify(event, {
    type: 'external.request.assigned',
    userId: request.userId,
    context: {
      name: request.who,
      title: request.title,
      room: space.name,
      where: [space.building, space.campus].filter(Boolean).join(', ') || 'somewhere in the union',
      when: formatLondon(new Date(request.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
      roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine`,
    },
  })

  return { ok: true, id, status: 'CONFIRMED' as const, space: { id: space.id, name: space.name } }
})
