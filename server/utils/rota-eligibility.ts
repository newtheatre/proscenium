import { createError } from 'h3'
import { gatingModules, roleEligibilities } from './rota-readiness'
import { hasCommitteeRole } from './committee-standing'
import { eligibilityRefusal, forCommitteeMembers, needsCommitteeRole, noLongerOnCommittee, noLongerQualifies } from '#shared/utils/rota-eligibility'
import { saysShiftRole } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'
import type { H3Error, H3Event } from 'h3'

export interface ShiftEligibility {
  eligible: boolean
  // What would unlock it, for a role the member does not qualify for. Null when eligible, and
  // when nothing a member can act on is named: no module, or one that is not published (issue 1318).
  unlockedBy: { moduleId: string, moduleName: string } | null
  // The role needs a live committee role the member does not hold, which no training opens (0114).
  needsCommittee: boolean
}

// The 403 a claim or an officer's assignment raises on the live check: a missing committee role is
// named as that, never as a training gap. `memberName` is set when an officer is told (0114).
export function ineligibleRefusal(role: ShiftRole, eligibility: ShiftEligibility, memberName?: string): H3Error {
  if (eligibility.needsCommittee) {
    return createError({ statusCode: 403, statusMessage: forCommitteeMembers(role, memberName ? `${memberName} does not` : 'you do not') })
  }
  const said = saysShiftRole(role).toLowerCase()
  return createError({
    statusCode: 403,
    statusMessage: memberName ? `That member does not currently qualify for a ${said} shift` : `You do not currently qualify for a ${said} shift`,
  })
}

// The 409 an approval raises when its write's training gate refused the claimant: it names what
// lapsed, and its data carries the decline reason the screen offers (E-105 criterion 3).
export async function lapsedClaimRefusal(role: ShiftRole, userId: string, moduleId: string | null): Promise<H3Error> {
  const claimant = await findById(userId)
  const name = claimant?.name ?? 'the claimant'
  if (needsCommitteeRole(role) && !(await hasCommitteeRole(userId))) {
    const left = noLongerOnCommittee(role, name)
    return createError({ statusCode: 409, statusMessage: left.statusMessage, data: { declineReason: left.declineReason } })
  }
  const moduleName = moduleId === null ? null : (await gatingModules([moduleId])).get(moduleId)?.name ?? moduleId
  const lapsed = noLongerQualifies(role, name, moduleName)
  return createError({ statusCode: 409, statusMessage: lapsed.statusMessage, data: { declineReason: lapsed.declineReason } })
}

// Held modules come from `modulesHeldBy()`, never a copy of it: an EXPIRING record counts as
// held here exactly because it does there, and this is one request's own read (criteria 1, 3).
export async function shiftEligibilities(
  event: H3Event,
  userId: string,
  today: string,
): Promise<Record<ShiftRole, ShiftEligibility>> {
  const [lines, held, committee] = await Promise.all([roleEligibilities(event), modulesHeldBy(userId, today), hasCommitteeRole(userId)])

  const result = {} as Record<ShiftRole, ShiftEligibility>
  for (const line of lines) {
    // Checked first: a grant narrows who may take the shift and training never widens it (0114).
    if (needsCommitteeRole(line.role) && !committee) {
      result[line.role] = { eligible: false, unlockedBy: null, needsCommittee: true }
      continue
    }
    const refusal = eligibilityRefusal(line.moduleId, held)
    result[line.role] = {
      eligible: refusal === null,
      unlockedBy: refusal !== null && line.standing === 'SET' ? { moduleId: refusal, moduleName: line.moduleName ?? refusal } : null,
      needsCommittee: false,
    }
  }
  return result
}
