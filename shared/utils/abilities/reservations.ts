/**
 * Staff list, create, read and update reservations; customers may read only
 * their own.
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

/** Refund a ticket — ADMIN and MANAGER only. */
export const refundTicket = defineAbility((user: AbilityUser) => isAdminOrManager(user))
