import { can } from './abilities'
import { NO_SHIFT_REFUSAL_OPENING } from './night-authority'
import { PERMISSION_MAP, ROLES, saysRole } from './roles'
import type { BouncerAbility } from 'nuxt-authorization/utils'
import type { Viewer } from './abilities'
import type { Role } from './roles'

// A signed-in refusal names who a screen is for, read from the same abilities the navigation and
// the guard use, never a second list (issue 1304, K-133, 0040).

// Every role that opens a screen by its standing permissions alone. The IT Manager holds every
// permission, so naming it would send everyone to the one person least likely to be in the room.
export function rolesThatReach(ability: BouncerAbility<Viewer>): Role[] {
  return ROLES.filter(role => role !== 'ADMIN' && can({
    id: role,
    permissions: [...PERMISSION_MAP[role]],
    onShiftTonight: false,
    leadsDepartment: false,
    isTrainer: false,
    keepsBarTab: false,
    membershipState: { kind: 'none' },
  }, ability))
}

// A department lead or a trainer opens some screens by standing, not role (0243).
export type ScreenStanding = 'lead' | 'trainer'
const STANDING_SAYS: Record<ScreenStanding, string> = { lead: 'department leads', trainer: 'trainers' }

export function standingsThatReach(ability: BouncerAbility<Viewer>): ScreenStanding[] {
  const viewer = (standing: ScreenStanding): Viewer => ({
    id: standing,
    permissions: [],
    onShiftTonight: false,
    leadsDepartment: standing === 'lead',
    isTrainer: standing === 'trainer',
    keepsBarTab: false,
    membershipState: { kind: 'none' },
  })
  return (['lead', 'trainer'] as const).filter(standing => can(viewer(standing), ability))
}

export function saysScreenIsFor(roles: readonly Role[], standings: readonly ScreenStanding[] = []): string {
  if (roles.length === 0 && standings.length === 0) return 'Your account does not open this screen'
  const named = [...roles.map(role => `the ${saysRole(role)}`), ...standings.map(one => STANDING_SAYS[one])]
  const joined = named.length > 1 ? `${named.slice(0, -1).join(', ')} or ${named[named.length - 1]}` : named[0]
  return `This screen is for ${joined}.`
}

// Refused every role: the server's ranked refusal, where it says more than no shift at all, such
// as hours not yet open or a claim not yet confirmed (issue 1303, 0078). Otherwise nothing to add.
export function hubRefusal(said: string | null): string | null {
  if (!said) return null
  // A door refusal may go on to name tonight's duty manager (0095); it is still no shift at all.
  return said.startsWith(NO_SHIFT_REFUSAL_OPENING) ? null : said
}
