/**
 * Abilities for the shared warning vocabulary. Editing it is not a per-show
 * action — renaming an entry changes every production carrying it.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { isAdmin, isAdminOrManager, isStaff } from './types'

/** List the vocabulary — staff. */
export const listContentWarnings = defineAbility((user: AbilityUser) => isStaff(user))

/** Add a vocabulary entry — ADMIN and MANAGER. */
export const createContentWarning = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Edit or archive a vocabulary entry — ADMIN and MANAGER. */
export const updateContentWarning = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a vocabulary entry outright — ADMIN only. */
export const deleteContentWarning = defineAbility((user: AbilityUser) => isAdmin(user))
