import { countsAsHeld, stateOf, supersededIn } from '#shared/utils/training'

// A member's own training records, with each one's state worked out from its dates.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const warningDays = await configValue(event, 'TRAINING_EXPIRY_WARNING_DAYS')
  const today = londonToday()

  // Revoked records are never the member's to see (G-101 criterion 6), and a superseded one is
  // hidden the same way: a renewal replaces what it renews.
  const held = await recordsFor(account.id)
  const superseded = supersededIn(held)

  const items = held.filter(record => !superseded.has(record.id)).map((record) => {
    // A brief never expires, so it shows its last-attended date and no state (criterion 5).
    const state = stateOf(record.expiresOn, today, warningDays)
    return {
      id: record.id,
      moduleId: record.moduleId,
      moduleName: record.moduleName,
      department: record.department,
      kind: record.kind,
      awardedOn: record.awardedOn,
      expiresOn: record.expiresOn,
      source: record.source,
      state: record.kind === 'BRIEF' ? null : state,
      held: countsAsHeld(state),
    }
  })

  // Derived, not stored: a certification is what makes somebody a trainer or a supervisor, and
  // it stops being true the moment that record expires or is revoked (G-111 criteria 1 and 4).
  const standing = await trainerStandingOf(account.id, today)

  return { items, total: items.length, standing }
})
