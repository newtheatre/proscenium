import { saysShiftRole } from './rota'
import type { ShiftRole } from './rota'

// The safety gate a shift's role stands behind (E-103). Pure: the caller supplies both sides,
// so the claim path (E-104) and this story's list can both call it without a second copy.

// Not a module id: a module id is uppercase letters, digits and hyphens (shared/utils/training.ts),
// so this can never be mistaken for one when a caller decides whether to link to a catalogue page.
const UNCONFIGURED_ELIGIBILITY_RULE = ''

// An unset or unreadable rule refuses rather than admits everyone (criterion 4). A configured
// rule the member does not hold refuses too, naming the module that would unlock it (criterion 2).
export function eligibilityRefusal(requiredModuleId: string | null, held: ReadonlySet<string>): string | null {
  if (requiredModuleId === null) return UNCONFIGURED_ELIGIBILITY_RULE
  return held.has(requiredModuleId) ? null : requiredModuleId
}

export interface LapsedClaim { statusMessage: string, declineReason: string }

// Why an officer could not confirm a queued claim, and the decline reason offered in its place,
// which the claimant reads word for word (E-105 criterion 3).
export function noLongerQualifies(role: ShiftRole, claimantName: string, moduleName: string | null): LapsedClaim {
  const said = saysShiftRole(role)
  const lower = said.toLowerCase()
  if (moduleName === null) {
    return {
      statusMessage: `No longer qualifies: no training is named for ${lower} shifts, so nobody can be confirmed on one`,
      declineReason: `${said} shifts cannot be confirmed until the committee names the training they need.`,
    }
  }
  return {
    statusMessage: `No longer qualifies: ${claimantName} no longer holds ${moduleName}, which a ${lower} shift needs`,
    declineReason: `You no longer hold ${moduleName}, which a ${lower} shift needs. Renew it and claim again.`,
  }
}

// Roles that also need a live committee role, at claim and at use: a grant that narrows who may
// take the shift and never opens anything by itself (0114, 0009).
const COMMITTEE_SHIFT_ROLES: readonly ShiftRole[] = ['DUTY_MANAGER']

export function needsCommitteeRole(role: ShiftRole): boolean {
  return COMMITTEE_SHIFT_ROLES.includes(role)
}

// `who` is "you do not" for the member themselves, or "<name> does not" for an officer.
export function forCommitteeMembers(role: ShiftRole, who: string): string {
  return `A ${saysShiftRole(role).toLowerCase()} shift is for committee members, and ${who} hold a committee role`
}

// The E-105 criterion 3 pair for a claimant who has left the committee since claiming (0114).
export function noLongerOnCommittee(role: ShiftRole, claimantName: string): LapsedClaim {
  const lower = saysShiftRole(role).toLowerCase()
  return {
    statusMessage: `No longer qualifies: ${claimantName} no longer holds a committee role, which a ${lower} shift needs`,
    declineReason: `A ${lower} shift is for committee members, and you no longer hold a committee role.`,
  }
}
