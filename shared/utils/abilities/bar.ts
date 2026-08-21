/**
 * The bar. Management is `bar.manage`; working the bar on a show night is
 * scoped by the rota, not by an ability (docs/13 §5).
 */
import { defineAbility } from '#imports'
import type { AbilityUser } from './types'
import { canManageBar } from './types'

/** Products, prices, stock, voids, and the Challenge 25 register export. */
export const manageBar = defineAbility((user: AbilityUser) => canManageBar(user))
