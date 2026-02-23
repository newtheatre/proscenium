/**
 * Reservation authorization abilities.
 *
 * Staff (ADMIN / MANAGER / BOX_OFFICE) can list, create, read, and update reservations.
 * Customers can only read their own reservations.
 * Only ADMIN / MANAGER can delete reservations.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { isAdminOrManager, isStaff } from './types'

/** List all reservations — staff only. */
export const listReservations = defineAbility((user: AbilityUser) => isStaff(user))

/** Create a reservation — staff only. */
export const createReservation = defineAbility((user: AbilityUser) => isStaff(user))

/** Read a specific reservation — staff can read any, customers only their own. */
export const readReservation = defineAbility((user: AbilityUser, resource: { userId: string }) => {
  if (isStaff(user)) return true
  return user.id === resource.userId
})

/** Update a reservation — staff only. */
export const updateReservation = defineAbility((user: AbilityUser) => isStaff(user))

/** Delete a reservation — ADMIN and MANAGER only. */
export const deleteReservation = defineAbility((user: AbilityUser) => isAdminOrManager(user))
