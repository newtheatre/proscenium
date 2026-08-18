/**
 * Venues and features are public to read. ADMIN/MANAGER create and update;
 * ADMIN deletes.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { isAdmin, isAdminOrManager } from './types'

// ── Venue abilities ──────────────────────────────────────────────

/** List venues — public. */
export const listVenues = defineAbility(() => true)

/** Create a venue — ADMIN and MANAGER. */
export const createVenue = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a venue — public. */
export const readVenue = defineAbility(() => true)

/** Update a venue — ADMIN and MANAGER. */
export const updateVenue = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a venue — ADMIN only. */
export const deleteVenue = defineAbility((user: AbilityUser) => isAdmin(user))

// ── Venue feature abilities ──────────────────────────────────────

/** List venue features — public. */
export const listVenueFeatures = defineAbility(() => true)

/** Create a venue feature — ADMIN and MANAGER. */
export const createVenueFeature = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Read a venue feature — public. */
export const readVenueFeature = defineAbility(() => true)

/** Update a venue feature — ADMIN and MANAGER. */
export const updateVenueFeature = defineAbility((user: AbilityUser) => isAdminOrManager(user))

/** Delete a venue feature — ADMIN only. */
export const deleteVenueFeature = defineAbility((user: AbilityUser) => isAdmin(user))
