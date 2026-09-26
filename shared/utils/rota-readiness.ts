import { SYSTEM_CHECKS, saysSystemCheck } from './checklist'
import { saysRole } from './roles'
import { SHIFT_ROLES, saysShiftRole } from './rota'
import type { SystemCheck } from './checklist'
import type { ShiftRole } from './rota'
import type { ModuleLifecycle } from './training'

// What a show night needs set up before a volunteer can take a shift at it (issue 1318, E-103,
// E-113, E-114, E-121). Nothing here reads a request or the database.

export const ELIGIBILITY_KEYS = {
  DUTY_MANAGER: 'SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE',
  DOOR: 'SHIFT_ELIGIBILITY_DOOR_MODULE',
  BAR: 'SHIFT_ELIGIBILITY_BAR_MODULE',
} as const satisfies Record<ShiftRole, string>

// UNSET and MISSING refuse every claim; DRAFT and RETIRED refuse everybody who does not already
// hold the module, which is nobody for a draft (E-103 criterion 4).
export type EligibilityStanding = 'SET' | 'UNSET' | 'DRAFT' | 'RETIRED' | 'MISSING'

export interface RoleEligibility {
  role: ShiftRole
  moduleId: string | null
  moduleName: string | null
  standing: EligibilityStanding
}

// `status` is the catalogue row's lifecycle, or null when no module carries the id at all.
export function eligibilityStanding(moduleId: string | null, status: ModuleLifecycle | null): EligibilityStanding {
  if (moduleId === null) return 'UNSET'
  if (status === null) return 'MISSING'
  if (status === 'DRAFT') return 'DRAFT'
  if (status === 'RETIRED') return 'RETIRED'
  return 'SET'
}

function saysModule(line: RoleEligibility): string {
  return line.moduleName === null ? line.moduleId ?? '' : `${line.moduleName} (${line.moduleId})`
}

// One sentence per role, read by an officer who cannot change it as well as by one who can.
export function saysEligibility(line: RoleEligibility): string {
  const shift = `${saysShiftRole(line.role).toLowerCase()} shift`
  switch (line.standing) {
    case 'SET': return `Unlocked by ${saysModule(line)}.`
    case 'UNSET': return `No module named yet, so nobody can claim a ${shift}.`
    case 'DRAFT': return `${saysModule(line)} is still a draft, so nobody holds it and nobody can claim a ${shift}.`
    case 'RETIRED': return `${saysModule(line)} is retired, so nobody new can gain it to claim a ${shift}.`
    case 'MISSING': return `Names ${line.moduleId}, which is not in the catalogue, so nobody can claim a ${shift}.`
    default: return line.standing satisfies never
  }
}

// A role nobody can claim yet is the rota owner's to open, so the member is told whom to ask.
export function saysNotOpenYet(officers: readonly string[]): string {
  const title = saysRole('FOH_MANAGER')
  if (officers.length === 0) return `Not open for claiming yet: ask the ${title}.`
  return `Not open for claiming yet: ask ${officers.join(' or ')}, the ${title}.`
}

export interface VenueReadiness {
  venueId: string
  venueName: string
  templateSlots: number
  systemChecks: SystemCheck[]
  emergencyFiled: boolean
}

export function missingSystemChecks(present: readonly SystemCheck[]): SystemCheck[] {
  return SYSTEM_CHECKS.filter(check => !present.includes(check))
}

export function venueReady(venue: VenueReadiness): boolean {
  return venue.templateSlots > 0 && missingSystemChecks(venue.systemChecks).length === 0 && venue.emergencyFiled
}

export function saysChecklistReadiness(present: readonly SystemCheck[]): string {
  const missing = missingSystemChecks(present)
  if (missing.length === 0) return 'Both system checks are on the post-show checklist.'
  return `The post-show checklist has no ${missing.map(check => `"${saysSystemCheck(check)}"`).join(' or ')} check.`
}

export interface BoardReadiness {
  presets: number
  milestones: number
}

// The eligibility line /api/health reports beside `ok`, never folded into it: an unset key is a
// committee decision still to make, not the site being down.
export interface EligibilityHealth {
  ok: boolean
  roles: Record<ShiftRole, EligibilityStanding>
}

export function eligibilityHealth(lines: readonly RoleEligibility[]): EligibilityHealth {
  const roles = Object.fromEntries(SHIFT_ROLES.map(role => [role, lines.find(line => line.role === role)?.standing ?? 'UNSET'])) as Record<ShiftRole, EligibilityStanding>
  return { ok: SHIFT_ROLES.every(role => roles[role] === 'SET'), roles }
}
