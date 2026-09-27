import { changes } from '#shared/utils/audit'
import { saysShiftRole } from '#shared/utils/rota'
import { shiftClaimForm } from '#shared/utils/tonight'

// Claim an open shift in one tap. Eligibility is re-checked live and availability rides the
// write, so a stale list cannot claim past a training gate or a taken slot (E-104).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)
  const shareNumber = (await readValidatedBody(event, shiftClaimForm.parse))?.shareNumber

  const held = await shiftDetail(id)
  if (!held) throw noSuch('shift')

  const eligibilities = await shiftEligibilities(event, account.id, londonToday())
  if (!eligibilities[held.role].eligible) {
    throw createError({
      statusCode: 403,
      statusMessage: `You do not currently qualify for a ${saysShiftRole(held.role).toLowerCase()} shift`,
    })
  }

  const autoConfirm = await configValue(event, 'SHIFT_CLAIM_AUTO_CONFIRM')
  const status = autoConfirm ? 'CONFIRMED' : 'CLAIMED'

  // The answer given, never the number it shares (0011, A-114).
  const entry = auditEntry({
    actorId: account.id,
    action: 'shift.claimed',
    target: `shift:${id}`,
    detail: {
      ...changes({ status: [held.status, status] }),
      ...(shareNumber === undefined ? {} : { sharesNumber: shareNumber }),
    },
  })

  // The duty manager's answer lands only behind this claim's own audit row (issue 1310).
  const answer = shareNumber === undefined ? [] : [db.run(shareNumberStatement(entry.id, account.id, shareNumber))]
  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(claimShiftStatement(id, account.id, status)), entry, ...answer))

  if (!applied) {
    const now = await shiftDetail(id)
    if (!now) throw noSuch('shift')
    if (now.status !== 'OPEN') throw createError({ statusCode: 409, statusMessage: 'That shift has already been taken' })
    throw createError({ statusCode: 409, statusMessage: 'You already hold a shift on this performance' })
  }

  return { ok: true, status }
})
