import { can } from './abilities'
import { NIGHT_ROLES, nightAuthorityRefusal } from './night-authority'
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

export function saysScreenIsFor(roles: readonly Role[]): string {
  if (roles.length === 0) return 'Your account does not open this screen'
  const named = roles.map(role => `the ${saysRole(role)}`)
  const joined = named.length > 1 ? `${named.slice(0, -1).join(', ')} or ${named[named.length - 1]}` : named[0]
  return `This screen is for ${joined}.`
}

// Refused every role: the server's ranked refusal, where it says more than no shift at all, such
// as hours not yet open or a claim not yet confirmed (issue 1303, 0078). Otherwise nothing to add.
export function hubRefusal(said: string | null): string | null {
  if (!said) return null
  // A door refusal may go on to name tonight's duty manager (0095); it is still no shift at all.
  return NIGHT_ROLES.some(role => said.startsWith(nightAuthorityRefusal(role).statusMessage)) ? null : said
}
