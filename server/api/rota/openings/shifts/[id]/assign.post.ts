import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { shiftAssignForm } from '#shared/utils/rota'
import { openingReassignRefusal } from '#shared/utils/rota-openings'

// Put an eligible member on a slot of a bar opening, or replace whoever holds it: confirmed by
// definition, so it never joins the approval queue (E-107 criterion 3, E-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')
  const { userId } = await readValidatedBodyOrThrow(event, shiftAssignForm)

  const held = await openingShiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such bar opening slot' })
  if (held.openingStatus === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'This opening has been cancelled' })
  }

  const subject = await findById(userId)
  if (!subject || subject.anonymisedAt !== null) throw createError({ statusCode: 404, statusMessage: 'No such member' })
  if (subject.disabled) throw createError({ statusCode: 403, statusMessage: 'That account is disabled and cannot be assigned a shift' })

  // The same live gate self-claiming rides: an officer's assignment does not admit somebody a
  // training gap would otherwise refuse (E-107 criterion 3).
  const eligibilities = await shiftEligibilities(event, userId, londonToday())
  if (!eligibilities.BAR.eligible) {
    throw createError({ statusCode: 403, statusMessage: 'That member does not currently qualify for a bar shift' })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.reassigned',
    target: `bar-opening-shift:${id}`,
    detail: changes({ userId: [held.userId, userId], status: [held.status, 'CONFIRMED'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(assignOpeningShiftStatement(id, userId, resolved.account.id)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: openingReassignRefusal(now?.status ?? held.status) })
  }

  const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })

  if (held.userId && held.userId !== userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.removed',
      context: { name: '', show: held.label, venue: held.venueName, when, role: 'bar' },
    })
  }

  await notify(event, {
    userId,
    type: 'shift.assigned',
    context: { name: '', show: held.label, venue: held.venueName, when, role: 'bar' },
  })

  return { ok: true, status: 'CONFIRMED' }
})
