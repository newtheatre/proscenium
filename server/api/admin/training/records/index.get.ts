import { z } from 'zod'
import { countsAsHeld, saysState, stateOf, supersededIn } from '#shared/utils/training'

const query = z.object({
  userId: z.string().trim().min(1).max(64),
})

// One person's whole training history, revoked and superseded records included: the view G-101
// criterion 6 keeps for leads and administrators and away from the member.
export default defineEventHandler(async (event) => {
  const resolved = await requireCatalogueReader(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const warningDays = await configValue(event, 'TRAINING_EXPIRY_WARNING_DAYS')
  const today = londonToday()

  const held = await recordsFor(input.userId, true)
  const superseded = supersededIn(held.filter(record => record.revokedAt === null))

  const items = held
    .filter(record => scopeToLeadOf(resolved) === undefined
      || resolved.leads.some(lead => lead.department === record.department))
    .map((record) => {
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
        revokedAt: record.revokedAt,
        superseded: superseded.has(record.id),
        state: record.kind === 'BRIEF' ? null : state,
        says: record.kind === 'BRIEF' ? 'Attended' : saysState(state),
        held: record.revokedAt === null && !superseded.has(record.id) && countsAsHeld(state),
      }
    })

  return { items, total: items.length }
})
