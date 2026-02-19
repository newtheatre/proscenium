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

// Venue abilities
// List venues - Everyone can list venues (public data)
export const listVenues = defineAbility(() => true)

// Create venue - ADMIN and MANAGER can create venues
export const createVenue = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Read venue - Everyone can read venues (public data)
export const readVenue = defineAbility(() => true)

// Update venue - ADMIN and MANAGER can update venues
export const updateVenue = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Delete venue - Only ADMIN can delete venues
export const deleteVenue = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})

// Venue feature abilities
// List features - Everyone can list features (public data)
export const listVenueFeatures = defineAbility(() => true)

// Create feature - ADMIN and MANAGER can create features
export const createVenueFeature = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Read feature - Everyone can read features (public data)
export const readVenueFeature = defineAbility(() => true)

// Update feature - ADMIN and MANAGER can update features
export const updateVenueFeature = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Delete feature - Only ADMIN can delete features
export const deleteVenueFeature = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})
