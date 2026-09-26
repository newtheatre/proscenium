import { createError } from 'h3'
import { gatingModules, roleEligibilities } from './rota-readiness'
import { eligibilityRefusal, noLongerQualifies } from '#shared/utils/rota-eligibility'
import type { ShiftRole } from '#shared/utils/rota'
import type { H3Error, H3Event } from 'h3'

export interface ShiftEligibility {
  eligible: boolean
  // What would unlock it, for a role the member does not qualify for. Null when eligible, and
  // when nothing a member can act on is named: no module, or one that is not published (issue 1318).
  unlockedBy: { moduleId: string, moduleName: string } | null
}

// The 409 an approval raises when its write's training gate refused the claimant: it names what
// lapsed, and its data carries the decline reason the screen offers (E-105 criterion 3).
export async function lapsedClaimRefusal(role: ShiftRole, userId: string, moduleId: string | null): Promise<H3Error> {
  const claimant = await findById(userId)
  const moduleName = moduleId === null ? null : (await gatingModules([moduleId])).get(moduleId)?.name ?? moduleId
  const lapsed = noLongerQualifies(role, claimant?.name ?? 'the claimant', moduleName)
  return createError({ statusCode: 409, statusMessage: lapsed.statusMessage, data: { declineReason: lapsed.declineReason } })
}

// Held modules come from `modulesHeldBy()`, never a copy of it: an EXPIRING record counts as
// held here exactly because it does there, and this is one request's own read (criteria 1, 3).
export async function shiftEligibilities(
  event: H3Event,
  userId: string,
  today: string,
): Promise<Record<ShiftRole, ShiftEligibility>> {
  const [lines, held] = await Promise.all([roleEligibilities(event), modulesHeldBy(userId, today)])

  const result = {} as Record<ShiftRole, ShiftEligibility>
  for (const line of lines) {
    const refusal = eligibilityRefusal(line.moduleId, held)
    result[line.role] = {
      eligible: refusal === null,
      unlockedBy: refusal !== null && line.standing === 'SET' ? { moduleId: refusal, moduleName: line.moduleName ?? refusal } : null,
    }
  }
  return result
}
