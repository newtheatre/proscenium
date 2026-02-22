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

// Ticket type abilities
// List ticket types - Everyone can list ticket types (needed for booking flows)
export const listTicketTypes = defineAbility(() => true)

// Create ticket type - ADMIN and MANAGER can create ticket types
export const createTicketType = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Read ticket type - Everyone can read ticket types
export const readTicketType = defineAbility(() => true)

// Update ticket type - ADMIN and MANAGER can update ticket types
export const updateTicketType = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Delete ticket type - Only ADMIN can delete ticket types
export const deleteTicketType = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})

// Show abilities
// List shows - Everyone can list shows (public data)
export const listShows = defineAbility(() => true)

// Create show - ADMIN and MANAGER can create shows
export const createShow = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Read show - Everyone can read shows (public data)
export const readShow = defineAbility(() => true)

// Update show - ADMIN and MANAGER can update shows
export const updateShow = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Delete show - Only ADMIN can delete shows
export const deleteShow = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN')
})

// Performance abilities
// Create performance - ADMIN and MANAGER can create performances
export const createPerformance = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Update performance - ADMIN and MANAGER can update performances
export const updatePerformance = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Delete performance - ADMIN and MANAGER can delete performances
export const deletePerformance = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})

// Reservation abilities
// List all reservations - staff only
export const listReservations = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')
})

// Create a reservation - staff only (customers use the public booking flow)
export const createReservation = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')
})

// Read a specific reservation - staff can read any, customers only their own
export const readReservation = defineAbility((user: User, resource: { userId: string }) => {
  if (hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')) return true
  return user.id === resource.userId
})

// Update a reservation - staff only
export const updateReservation = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER') || hasRole(user, 'BOX_OFFICE')
})

// Delete a reservation - ADMIN and MANAGER only
export const deleteReservation = defineAbility((user: User) => {
  return hasRole(user, 'ADMIN') || hasRole(user, 'MANAGER')
})
