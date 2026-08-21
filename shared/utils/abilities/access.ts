/**
 * Access profiles. Deliberately not part of `BOX_OFFICE`: selling someone a
 * ticket is not a reason to read their access needs (ADR-0022).
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { canVerifyAccess } from './types'

/** Read and verify access profiles away from a show night. */
export const verifyAccess = defineAbility((user: AbilityUser) => canVerifyAccess(user))
