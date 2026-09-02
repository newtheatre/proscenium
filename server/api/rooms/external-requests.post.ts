import { externalRequestForm, judgeExternal } from '#shared/utils/external-requests'
import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { formatLondon } from '#shared/utils/london'

// Ask for a room not listed here, with an optional preference.
export default defineEventHandler(async (event) => {
  const { account } = await authority(event)
  const input = await readValidatedBodyOrThrow(event, externalRequestForm)
  const purpose = await requirePurpose(event, input.purpose)

  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  const now = new Date()

  const failures = judgeExternal({ startsAt, endsAt }, {
    now,
    hasMembership: await hasCurrentMembership(event, account.id, now),
    noticeWorkingDays: await configValue(event, 'EXTERNAL_REQUEST_NOTICE_WORKING_DAYS'),
    horizonWeeks: await configValue(event, 'ROOM_BOOKING_HORIZON_WEEKS'),
    holidays: await configValue(event, 'BANK_HOLIDAYS'),
  })

  // Nothing an officer could wave through, because somebody else is the one being asked.
  if (failures.length > 0) {
    throw createError({ statusCode: 422, statusMessage: failures[0]!.says, data: { failures } })
  }

  if (input.preferredSpaceId) {
    const space = await findSpace(input.preferredSpaceId)
    if (!space || !space.isActive) {
      throw createError({ statusCode: 422, statusMessage: 'That room is not one we have listed' })
    }
  }

  const id = newId()
  await db.insert(schema.externalRequests).values({
    id,
    userId: account.id,
    title: input.title,
    purpose,
    attendees: input.attendees,
    startsAt: Math.floor(startsAt.getTime() / 1000),
    endsAt: Math.floor(endsAt.getTime() / 1000),
    preferredSpaceId: input.preferredSpaceId,
    notes: input.notes,
  })

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'external.requested',
    target: `external:${id}`,
    detail: { purpose, preferred: input.preferredSpaceId },
  }))

  const when = formatLondon(startsAt, { dateStyle: 'full', timeStyle: 'short' })
  await notify(event, {
    type: 'external.request.received',
    userId: account.id,
    context: { name: account.name, title: input.title, when, roomsUrl: `${useRuntimeConfig(event).public.baseURL}/rooms/mine` },
  })

  for (const approver of await approvers()) {
    await notify(event, {
      type: 'external.request.raised',
      userId: approver.id,
      context: {
        name: approver.name,
        who: account.name,
        title: input.title,
        when,
        queueUrl: `${useRuntimeConfig(event).public.baseURL}/admin/su-requests`,
      },
    })
  }

  // A warning, never a refusal: the member may still want the room they asked for.
  const notes = input.preferredSpaceId ? await notesFor({ spaceIds: [input.preferredSpaceId], purpose }) : []

  return {
    ok: true,
    id,
    status: 'REQUESTED' as const,
    warning: warningFor(noteFor(notes, input.preferredSpaceId ?? '', purpose)),
  }
})
