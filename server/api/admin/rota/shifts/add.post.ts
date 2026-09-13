import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { addShiftForm, saysShiftRole } from '#shared/utils/rota'

// An ad hoc shift on a performance, outside the venue template (E-107 criterion 5, issue 933):
// the role and slot are the officer's own choice, an optional person confirms it at once.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'rota.write')
  const input = await readValidatedBodyOrThrow(event, addShiftForm)

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  if (performance.status === 'CANCELLED') throw createError({ statusCode: 409, statusMessage: 'This performance has been cancelled' })

  let subject = null
  if (input.userId) {
    subject = await findById(input.userId)
    if (!subject || subject.anonymisedAt !== null) throw createError({ statusCode: 404, statusMessage: 'No such member' })
    if (subject.disabled) throw createError({ statusCode: 403, statusMessage: 'That account is disabled and cannot be assigned a shift' })

    const eligibilities = await shiftEligibilities(event, input.userId, londonToday())
    if (!eligibilities[input.role].eligible) {
      throw createError({
        statusCode: 403,
        statusMessage: `That member does not currently qualify for a ${saysShiftRole(input.role).toLowerCase()} shift`,
      })
    }
  }

  const shiftId = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.added',
    target: `performance:${input.performanceId}`,
    detail: changes({ role: [null, input.role], slot: [null, input.slot], userId: [null, input.userId ?? null] }),
  })

  await withShiftConstraints(() => auditedWrite(db.run(addShiftStatement(shiftId, input, resolved.account.id)), entry))

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
