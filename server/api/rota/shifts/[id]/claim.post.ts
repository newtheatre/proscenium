import { changes } from '#shared/utils/audit'
import { formatLondon, londonClock } from '#shared/utils/london'
import { UNPUBLISHED_REFUSAL, clashRefusal, saysShiftRole } from '#shared/utils/rota'
import { BOARD_WAITING_HREF } from '#shared/utils/rota-board'
import { shiftClaimForm } from '#shared/utils/tonight'

// Claim an open shift in one tap. Eligibility is re-checked live and availability rides the
// write, so a stale list cannot claim past a training gate or a taken slot (E-104).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)
  const shareNumber = (await readValidatedBody(event, shiftClaimForm.parse))?.shareNumber

  const held = await shiftDetail(id)
  if (!held) throw noSuch('shift')

  const today = londonToday()
  const eligibility = (await shiftEligibilities(event, account.id, today))[held.role]
  if (!eligibility.eligible) throw ineligibleRefusal(held.role, eligibility)
  // The same gate rides the write, so a record or a committee role lapsing after this check admits
  // nobody (#1302, 0115).
  const gate = shiftGate(held.role, (await shiftRoleRules(event))[held.role], today, Math.floor(Date.now() / 1000))

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
  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(claimShiftStatement(id, account.id, status, gate)), entry, ...answer))

  if (!applied) {
    const now = await shiftDetail(id)
    if (!now) throw noSuch('shift')
    if (now.status !== 'OPEN') throw createError({ statusCode: 409, statusMessage: 'That shift has already been taken' })
    const again = (await shiftEligibilities(event, account.id, today))[held.role]
    if (!again.eligible) throw ineligibleRefusal(held.role, again)
    if (!(await showIsPublished(held.performanceId))) throw createError({ statusCode: 409, statusMessage: UNPUBLISHED_REFUSAL })
    const clash = await clashingShift(account.id, id)
    if (clash) throw createError({ statusCode: 409, statusMessage: clashRefusal(null, clash) })
    throw createError({ statusCode: 409, statusMessage: 'You already hold a shift on this performance' })
  }

  // Confirmed at once, the claimant has it in writing as an approval would give it; queued, the
  // rota's officers are told now rather than at the morning's digest (0212).
  const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const role = saysShiftRole(held.role).toLowerCase()
  if (status === 'CONFIRMED') {
    await notify(event, {
      userId: account.id,
      type: 'shift.approved',
      context: {
        name: '', show: held.showTitle, venue: held.venueName, when, role,
        callTime: held.shiftStartsAt === null ? undefined : londonClock(new Date(held.shiftStartsAt * 1000)),
      },
    })
  }
  else {
    const officers = await rotaOfficers()
    const url = `${useRuntimeConfig(event).public.baseURL}${BOARD_WAITING_HREF}`
    await Promise.all(officers.map(officer => notify(event, {
      userId: officer.id,
      type: 'shift.claim-waiting',
      context: { name: '', claimant: account.name, show: held.showTitle, venue: held.venueName, when, role, url },
    })))
  }

  return { ok: true, status }
})
