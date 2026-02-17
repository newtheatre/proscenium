// User abilities for authorization
import { defineAbility } from '#imports'

interface User {
  id: string
  email: string
  name: string
  verified: boolean
  roles: string[]
}

interface UserResource {
  id: string
}

// Helper to check if user has a role
function hasRole(user: User, role: string): boolean {
  return user.roles?.includes(role) || false
}

// List all users - ADMIN, MANAGER, and BOX_OFFICE can list users
export const listUsers = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')
})

// Create a user - ADMIN and MANAGER can create users
export const createUser = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Read a specific user - ADMIN, MANAGER, BOX_OFFICE can read any user, authenticated users can read their own profile
export const readUser = defineAbility((user: User, resource: UserResource) => {
  // Admins, managers, and box office can read any user
  if (hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')) {
    return true
  }

  // Users can read their own profile
  return user.id === resource.id
})

// Update a user - ADMIN and MANAGER can update any user, authenticated users can update their own profile
export const updateUser = defineAbility((user: User, resource: UserResource) => {
  // Admins and managers can update any user
  if (hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')) {
    return true
  }

  // Users can update their own profile
  return user.id === resource.id
})

// Delete a user - ADMIN can delete users, and users can delete their own account, but ADMINs cannot delete themselves
export const deleteUser = defineAbility((user: User, resource: UserResource) => {
  // Users can delete their own account
  if (user.id === resource.id && !hasRole(user, 'ADMIN')) {
    return true
  }

  if (hasRole(user, 'ADMIN') && user.id !== resource.id) {
    return true
  }

  return false
})

// Update user roles - Only ADMIN can update user roles
export const updateUserRoles = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})

// Update user verified status - Only ADMIN can manually update verified status
export const updateUserVerified = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})

// Reset user password - ADMIN and MANAGER can trigger password resets for other users
export const resetUserPassword = defineAbility((user: User, resource: UserResource) => {
  if (user.id === resource.id) return false
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})
