/**
 * The show night screen. Holding the role is not enough: a confirmed shift
 * scopes it to tonight, server-side and as data (ADR-0019).
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { canManageFoh, canWorkFoh } from './types'

/** Reach `/foh` at all. What it then shows is the rota's business. */
export const workFoh = defineAbility((user: AbilityUser) => canWorkFoh(user))

/** Edit the emergency card and the contact list. */
export const manageFohReference = defineAbility((user: AbilityUser) => canManageFoh(user))
