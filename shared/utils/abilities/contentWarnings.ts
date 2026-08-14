/**
 * Content warning vocabulary authorization abilities.
 *
 * The vocabulary is shared across every show, so editing it is not a per-show
 * action: renaming an entry changes what every production carrying it says.
 * Listing is staff-wide because the box office needs to answer "does this show
 * have strobe?" on the phone; changing it is ADMIN / MANAGER, and deleting is
 * ADMIN only — though the endpoint refuses a delete that any show depends on
 * and points at archiving instead.
 *
 * These replace the previous arrangement, where the one read endpoint borrowed
 * `updateShow` because no warning ability existed.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { hasRole, isAdminOrManager, isStaff } from './types'

/** List the vocabulary — staff. */
export const listContentWarnings = defineAbility((user: AbilityUser) => isStaff(user))

/** Add a vocabulary entry — ADMIN and MANAGER. */
export const createContentWarning = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Edit or archive a vocabulary entry — ADMIN and MANAGER. */
export const updateContentWarning = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a vocabulary entry outright — ADMIN only. */
export const deleteContentWarning = defineAbility((user: AbilityUser) => hasRole(user, 'ADMIN'))
