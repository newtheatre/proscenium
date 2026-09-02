import { chunked } from '#shared/utils/approvals'
import { DELIVERY_RECORDS_PER_STATEMENT, deliveryLogForm } from '#shared/utils/training'

// Log a session delivered off-system. It computes the same plan the dry-run showed and writes it
// in one batch, awarded at the day it was taught (G-118 criteria 4 and 5).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, deliveryLogForm)

  const plan = await planDelivery(resolved, input, await academicYear(event), londonToday())

  // Criterion 3. Safety-critical gaps block absolutely; ordinary ones need their own tick.
  assertLoggable(plan, input.acknowledged)

  // Criterion 2. The count comes back from the dry-run and is checked against the plan as it
  // stands now, so a log whose room moved while it was being read is refused rather than guessed.
  if (plan.creates !== input.expectedCount) {
    throw createError({
      statusCode: 409,
      statusMessage: `You confirmed ${input.expectedCount} records and this would now create ${plan.creates}. Please preview it again.`,
    })
  }

  const records = deliveryRecords(plan, resolved.account.id)

  // Criterion 4 against 0003: one batch, chunked so no statement binds a parameter per attendee.
  const writes = chunked(records, DELIVERY_RECORDS_PER_STATEMENT)
    .map(part => db.insert(schema.trainingRecords).values(part))

  // One entry per person taught, which is how a trail about somebody is read (0028). The detail
  // names modules and counts, never a person.
  const trail = [...new Set(records.map(record => record.userId))].map((userId) => {
    const theirs = records.filter(record => record.userId === userId)
    return db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'record.delivery-logged',
      target: `user:${userId}`,
      detail: {
        heldOn: plan.heldOn,
        modules: theirs.map(record => record.moduleId),
        acknowledged: plan.gaps.filter(gap => gap.userId === userId).length,
      },
    }))
  })

  await db.batch([writes[0]!, ...writes.slice(1), ...trail])

  return { ok: true, created: records.length, alreadyHeld: plan.records.length - records.length }
})
