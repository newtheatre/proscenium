/**
 * The public reads shows through /api/whats-on. The raw endpoints expose DRAFT
 * shows and internal notes, so they are staff-only.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { hasRole, isAdminOrManager, isStaff } from './types'

// ── Show abilities ───────────────────────────────────────────────

/** List shows via /api/shows (exposes drafts and internal fields) — staff only. */
export const listShows = defineAbility((user: AbilityUser) => isStaff(user))

/** Create a show — ADMIN and MANAGER. */
export const createShow = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a show via /api/shows/:id (exposes drafts and internal fields) — staff only. */
export const readShow = defineAbility((user: AbilityUser) => isStaff(user))

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
