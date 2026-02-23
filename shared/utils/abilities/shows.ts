/**
 * Show and performance authorization abilities.
 *
 * Shows are public data (anyone can list/read).
 * ADMIN / MANAGER can create, update, and manage performances.
 * ADMIN only can delete shows.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { hasRole, isAdminOrManager } from './types'

// ── Show abilities ───────────────────────────────────────────────

/** List shows — public. */
export const listShows = defineAbility(() => true)

/** Create a show — ADMIN and MANAGER. */
export const createShow = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a show — public. */
export const readShow = defineAbility(() => true)

/** Update a show — ADMIN and MANAGER. */
export const updateShow = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a show — ADMIN only. */
export const deleteShow = defineAbility((user: AbilityUser) => hasRole(user, 'ADMIN'))

// ── Performance abilities ────────────────────────────────────────

/** Create a performance — ADMIN and MANAGER. */
export const createPerformance = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Update a performance — ADMIN and MANAGER. */
export const updatePerformance = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a performance — ADMIN and MANAGER. */
export const deletePerformance = defineAbility((user: AbilityUser) => isAdminOrManager(user))
