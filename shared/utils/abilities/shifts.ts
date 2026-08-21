/**
 * The rota. Reading it is staff work; changing it is the FOH manager's
 * (`shift.manage`). Scoping a shift to tonight is not an ability (ADR-0019).
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { canManageShifts, canWorkFoh, isStaff } from './types'

/** See the rota for a performance, including who is on. */
export const listShifts = defineAbility((user: AbilityUser) => isStaff(user) || canWorkFoh(user))

/** Create, assign, confirm, reassign or remove a shift. */
export const manageShifts = defineAbility((user: AbilityUser) => canManageShifts(user))
