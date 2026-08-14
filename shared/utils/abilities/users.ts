/**
 * User authorization abilities — for the local mirror only.
 *
 * - ADMIN / MANAGER / BOX_OFFICE can list and read mirror rows.
 * - ADMIN / MANAGER can create one (guest checkout's shadow user).
 * - ADMIN can delete one (except their own).
 * - Users can read their own.
 *
 * Credentials, roles and verification are the auth service's, not ours.
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

/*
 * Deliberately absent: `updateUser`, `updateUserRoles`, `updateUserVerified`,
 * `resetUserPassword`, `anonymiseUserAccount`. Credentials, roles,
 * verification and erasure all belong to the auth service; this app holds a
 * read-only mirror and must not carry role-editing or credential UI
 * (stage-door CLAUDE.md invariants 1 and 4). Erasure arrives via
 * `POST /api/_hooks/auth/anonymise` (ADR-0014).
 */
