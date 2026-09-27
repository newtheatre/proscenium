import { can } from './abilities'
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
  if (roles.length === 0) return 'Your account does not open this screen.'
  const named = roles.map(role => `the ${saysRole(role)}`)
  const joined = named.length > 1 ? `${named.slice(0, -1).join(', ')} or ${named[named.length - 1]}` : named[0]
  return `This screen is for ${joined}.`
}
