/**
 * For the local mirror only. Credentials, roles and verification belong to the
 * auth service.
 */
import { defineAbility } from '#imports'
import type { AbilityUser, OwnedResource } from './types'
import { isAdminOrManager, isStaff } from './types'
import { can } from '../permissions'

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
  if (user.id === resource.id && !can(user, 'user.delete.any')) return true
  if (can(user, 'user.delete.any') && user.id !== resource.id) return true
  return false
})

/*
 * Deliberately absent: updateUser, updateUserRoles, updateUserVerified,
 * resetUserPassword, anonymiseUserAccount — all the auth service's (ADR-0014).
 */
