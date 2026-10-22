import { changes } from '#shared/utils/audit'
import { formatLondon, londonClock } from '#shared/utils/london'
import { MAX_SLOT_COUNT, addShiftForm, clashRefusal, saysShiftRole } from '#shared/utils/rota'

// An ad hoc shift on a performance, outside the venue template (E-107 criterion 5, issue 933):
// the role is the officer's choice, the slot the next free one, an optional person confirms it.
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
    // The number may be the write's to choose, so the audit statement fills it in from the row.
    detail: changes({ role: [null, input.role], slot: [null, input.slot ?? null], userId: [null, input.userId ?? null] }),
  })

  const offsets = await shiftOffsetDefaults(event)
  const [added] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string, slot: number, startsAt: number | null }>(addShiftStatement(shiftId, input, resolved.account.id, offsets, gate)),
    db.run(addedShiftAuditStatement(entry, shiftId)),
  ]))
  if (added.length === 0) {
    if (input.slot === undefined && await slotsFull(input.performanceId, input.role)) {
      throw createError({ statusCode: 409, statusMessage: `This performance already has ${MAX_SLOT_COUNT} ${saysShiftRole(input.role)} shifts, the most it can hold` })
    }
    if (input.userId && subject) {
      const again = (await shiftEligibilities(event, input.userId, today))[input.role]
      if (!again.eligible) throw ineligibleRefusal(input.role, again, subject.name)
      // Eligible, so what refused the insert is a shift they already hold on this performance (0210)
      // or one elsewhere at the same time (0211).
      const onIt = await holdsShiftOn(input.performanceId, input.userId)
      throw createError({ statusCode: 409, statusMessage: onIt ? 'That member already holds a shift on this performance' : clashRefusal(subject.name, null) })
    }
    throw noSuch('performance')
  }

  if (subject) {
    const when = formatLondon(new Date(performance.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
    await notify(event, {
      userId: subject.id,
      type: 'shift.assigned',
      context: {
        name: '', show: performance.showTitle, venue: performance.venueName, when, role: saysShiftRole(input.role).toLowerCase(),
        callTime: added[0]?.startsAt == null ? undefined : londonClock(new Date(added[0].startsAt * 1000)),
      },
    })
  }

  return { ok: true, shiftId, slot: added[0]!.slot }
})
