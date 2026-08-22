/**
 * Ticket types are public to read. ADMIN/MANAGER create and update; ADMIN
 * deletes.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { isAdmin, isAdminOrManager } from './types'

/** List ticket types: public. */
export const listTicketTypes = defineAbility(() => true)

/** Create a ticket type: ADMIN and MANAGER. */
export const createTicketType = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a ticket type: public. */
export const readTicketType = defineAbility(() => true)

/** Update a ticket type: ADMIN and MANAGER. */
export const updateTicketType = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a ticket type: ADMIN only. */
export const deleteTicketType = defineAbility((user: AbilityUser) => isAdmin(user))
