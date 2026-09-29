import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { addShiftForm, saysShiftRole } from '#shared/utils/rota'

// An ad hoc shift on a performance, outside the venue template (E-107 criterion 5, issue 933):
// the role and slot are the officer's own choice, an optional person confirms it at once.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rota.write')
  const input = await readValidatedBodyOrThrow(event, addShiftForm)

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')
  if (performance.status === 'CANCELLED') throw createError({ statusCode: 409, statusMessage: 'This performance has been cancelled' })

  const today = londonToday()
  let subject = null
  if (input.userId) {
    subject = await findById(input.userId)
    if (!subject || subject.anonymisedAt !== null) throw noSuch('member')
    if (subject.disabled) throw createError({ statusCode: 403, statusMessage: 'That account is disabled and cannot be assigned a shift' })
    const eligibility = (await shiftEligibilities(event, input.userId, today))[input.role]
    if (!eligibility.eligible) throw ineligibleRefusal(input.role, eligibility, subject.name)
  }
  // The same gate rides the insert, so a record or a role lapsing after this check confirms nobody (#1302).
  const gate = shiftGate(input.role, (await shiftRoleRules(event))[input.role], today, Math.floor(Date.now() / 1000))

  const shiftId = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.added',
    target: `performance:${input.performanceId}`,
    detail: changes({ role: [null, input.role], slot: [null, input.slot], userId: [null, input.userId ?? null] }),
  })

  const offsets = await shiftOffsetDefaults(event)
  const added = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(addShiftStatement(shiftId, input, resolved.account.id, offsets, gate)), entry))
  if (!added) {
    if (input.userId && subject) {
      throw ineligibleRefusal(input.role, (await shiftEligibilities(event, input.userId, today))[input.role], subject.name)
    }
    throw noSuch('performance')
  }

  if (subject) {
    const when = formatLondon(new Date(performance.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
    await notify(event, {
      userId: subject.id,
      type: 'shift.assigned',
      context: { name: '', show: performance.showTitle, venue: performance.venueName, when, role: saysShiftRole(input.role).toLowerCase() },
    })
  }

  return { ok: true, shiftId }
})
