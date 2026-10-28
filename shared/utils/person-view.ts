import { saysShiftRole } from './rota'
import { needsCommitteeRole } from './rota-eligibility'
import { saysEligibility } from './rota-readiness'
import type { RoleEligibility } from './rota-readiness'

// Whether one person could be put on each rota role now, and if not what is missing (0255). The
// same facts the confirming write reads: the gating module held today, and a committee role.

export type StaffingStanding = 'CAN_STAFF' | 'DISABLED' | 'NOT_OPEN' | 'NO_MODULE' | 'NO_COMMITTEE_ROLE' | 'NEITHER'

export interface PersonRoleLine extends RoleEligibility {
  holdsModule: boolean
  holdsCommitteeRole: boolean
  staffing: StaffingStanding
}

export function staffingStanding(line: RoleEligibility, holdsModule: boolean, holdsCommitteeRole: boolean, disabled: boolean): StaffingStanding {
  if (disabled) return 'DISABLED'
  // A retired module still admits whoever holds it; nobody new can gain one that is not active.
  if (line.moduleId === null || line.standing === 'MISSING' || (!holdsModule && line.standing !== 'SET')) return 'NOT_OPEN'
  const committee = !needsCommitteeRole(line.role) || holdsCommitteeRole
  if (!holdsModule) return committee ? 'NO_MODULE' : 'NEITHER'
  return committee ? 'CAN_STAFF' : 'NO_COMMITTEE_ROLE'
}

function saysModule(line: RoleEligibility): string {
  return line.moduleName === null ? line.moduleId ?? '' : `${line.moduleName} (${line.moduleId})`
}

export function saysPersonStaffing(line: PersonRoleLine): string {
  const shift = `${saysShiftRole(line.role).toLowerCase()} shift`
  switch (line.staffing) {
    case 'CAN_STAFF': return `Can take a ${shift}.`
    case 'DISABLED': return 'The account is disabled, so it takes no shift.'
    case 'NOT_OPEN': return saysEligibility(line)
    case 'NO_MODULE': return `Needs ${saysModule(line)} to take a ${shift}.`
    case 'NO_COMMITTEE_ROLE': return `Holds ${saysModule(line)}, but a ${shift} also needs a committee role.`
    case 'NEITHER': return `Needs ${saysModule(line)} and a committee role to take a ${shift}.`
    default: return line.staffing satisfies never
  }
}

// Which fix a line points at; the screen links it only for a viewer who may open that screen.
export type StaffingFix = 'TRAINING' | 'ROLES' | 'TEMPLATES'

export function staffingFixes(staffing: StaffingStanding): StaffingFix[] {
  switch (staffing) {
    case 'NO_MODULE': return ['TRAINING']
    case 'NO_COMMITTEE_ROLE': return ['ROLES']
    case 'NEITHER': return ['TRAINING', 'ROLES']
    case 'NOT_OPEN': return ['TEMPLATES']
    default: return []
  }
}
