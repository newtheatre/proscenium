import { createError } from 'h3'
import { gatingModules, shiftRoleRules } from './rota-readiness'
import { eligibilityRefusal, noLongerQualifies } from '#shared/utils/rota-eligibility'
import { eligibilityStanding } from '#shared/utils/rota-readiness'
import { SHIFT_ROLES } from '#shared/utils/rota'
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
  const named = moduleId === null
    ? undefined
    : (await gatingModules({ DUTY_MANAGER: null, DOOR: null, BAR: null, [role]: moduleId })).get(moduleId)
  const moduleName = moduleId === null ? null : named?.name ?? moduleId
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
  const rules = await shiftRoleRules(event)
  const held = await modulesHeldBy(userId, today)
  const modules = await gatingModules(rules)

  const result = {} as Record<ShiftRole, ShiftEligibility>
  for (const role of SHIFT_ROLES) {
    const refusal = eligibilityRefusal(rules[role], held)
    const module = refusal === null ? undefined : modules.get(refusal)
    result[role] = refusal === null
      ? { eligible: true, unlockedBy: null }
      : {
          eligible: false,
          unlockedBy: module && eligibilityStanding(refusal, module.status) === 'SET' ? { moduleId: refusal, moduleName: module.name } : null,
        }
  }
  return result
}
