import { changes } from '#shared/utils/audit'
import { openingClaimRefusal } from '#shared/utils/rota-openings'

// Claim a slot on a bar opening in one tap. Every slot on an opening is a bar slot, so the bar
// training gate is the one re-checked live, and availability rides the write (E-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await openingShiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such bar opening slot' })
  if (held.openingStatus === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'This opening has been cancelled' })
  }

  const eligibilities = await shiftEligibilities(event, account.id, londonToday())
  if (!eligibilities.BAR.eligible) {
    throw createError({ statusCode: 403, statusMessage: 'You do not currently qualify for a bar shift' })
  }

  const autoConfirm = await configValue(event, 'SHIFT_CLAIM_AUTO_CONFIRM')
  const status = autoConfirm ? 'CONFIRMED' : 'CLAIMED'

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar-opening-shift.claimed',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(claimOpeningShiftStatement(id, account.id, status)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such bar opening slot' })
    throw createError({ statusCode: 409, statusMessage: openingClaimRefusal(now.status) })
  }

  return { ok: true, status }
})
