/**
 * Pass products are configuration (ADMIN/MANAGER). Issuing and redeeming is
 * box-office work.
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { isAdminOrManager, isStaff } from './types'

// ── Seasons ──────────────────────────────────────────────────────
export const listSeasons = defineAbility((user: AbilityUser) => isStaff(user))
export const manageSeasons = defineAbility((user: AbilityUser) => isAdminOrManager(user))

// ── Pass products ────────────────────────────────────────────────
export const listPassTypes = defineAbility((user: AbilityUser) => isStaff(user))
export const managePassTypes = defineAbility((user: AbilityUser) => isAdminOrManager(user))

// ── Issued passes ────────────────────────────────────────────────
/** Look a pass up at the door. */
export const listPasses = defineAbility((user: AbilityUser) => isStaff(user))
/** Sell a pass. */
export const issuePass = defineAbility((user: AbilityUser) => isStaff(user))
/** Admit a holder against their pass. */
export const redeemPass = defineAbility((user: AbilityUser) => isStaff(user))
/** Cancel an issued pass — money, so same bar as refunds. */
export const cancelPass = defineAbility((user: AbilityUser) => isAdminOrManager(user))
