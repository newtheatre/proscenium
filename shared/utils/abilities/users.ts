/**
 * User authorization abilities.
 *
 * - ADMIN / MANAGER / BOX_OFFICE can list and read users.
 * - ADMIN / MANAGER can create and update users.
 * - ADMIN can delete users (except themselves) and manage roles/verified status.
 * - Authenticated users can read, update, and delete their own profile.
 */
import { defineAbility } from '#imports'
import type { AbilityUser, OwnedResource } from './types'
import { hasRole, isAdminOrManager, isStaff } from './types'

/** List all users — staff only. */
export const listUsers = defineAbility((user: AbilityUser) => isStaff(user))

/** Create a user — ADMIN and MANAGER. */
export const createUser = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a specific user — staff can read any, users can read their own. */
export const readUser = defineAbility((user: AbilityUser, resource: OwnedResource) => {
  if (isStaff(user)) return true
  return user.id === resource.id
})

/** Update a user — ADMIN/MANAGER can update any, users can update their own. */
export const updateUser = defineAbility((user: AbilityUser, resource: OwnedResource) => {
  if (isAdminOrManager(user)) return true
  return user.id === resource.id
})

/** Delete a user — ADMIN can delete others, users can delete themselves (except ADMINs). */
export const deleteUser = defineAbility((user: AbilityUser, resource: OwnedResource) => {
  if (user.id === resource.id && !hasRole(user, 'ADMIN')) return true
  if (hasRole(user, 'ADMIN') && user.id !== resource.id) return true
  return false
})

/**
 * Anonymise a user — same rule as deletion.
 *
 * Deletion is impossible for anyone with booking history (the foreign key is
 * restrict, and the sales record has to be kept), so this is the path that
 * actually answers an erasure request. It therefore carries the same permission
 * as the deletion it stands in for, and no more: you may close your own
 * account, an ADMIN may close someone else's, and an ADMIN cannot close their
 * own by this route.
 */
export const anonymiseUserAccount = deleteUser

/** Update user roles — ADMIN only. */
export const updateUserRoles = defineAbility((user: AbilityUser) => hasRole(user, 'ADMIN'))

/** Update user verified status — ADMIN only. */
export const updateUserVerified = defineAbility((user: AbilityUser) => hasRole(user, 'ADMIN'))

/** Trigger a password reset for another user — ADMIN and MANAGER. */
export const resetUserPassword = defineAbility((user: AbilityUser, resource: OwnedResource) => {
  if (user.id === resource.id) return false
  return isAdminOrManager(user)
})
