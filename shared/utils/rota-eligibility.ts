import { saysShiftRole } from './rota'
import type { ShiftRole } from './rota'

// The safety gate a shift's role stands behind (E-103). Pure: the caller supplies both sides,
// so the claim path (E-104) and this story's list can both call it without a second copy.

// Not a module id: a module id is uppercase letters, digits and hyphens (shared/utils/training.ts),
// so this can never be mistaken for one when a caller decides whether to link to a catalogue page.
export const UNCONFIGURED_ELIGIBILITY_RULE = ''

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
  if (moduleName === null) {
    return {
      statusMessage: `No longer qualifies: no training is named for ${said.toLowerCase()} shifts, so nobody can be confirmed on one`,
      declineReason: `${said} shifts cannot be confirmed until the committee names the training they need.`,
    }
  }
  return {
    statusMessage: `No longer qualifies: ${claimantName} no longer holds ${moduleName}, which a ${said.toLowerCase()} shift needs`,
    declineReason: `You no longer hold ${moduleName}, which a ${said.toLowerCase()} shift needs. Renew it and claim again.`,
  }
}
