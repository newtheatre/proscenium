import { h } from 'vue'
import type { VNode } from 'vue'

// A secondary column at 390px pushes every row action off-screen behind a horizontal scroll
// (issue 922). Hidden below sm, its content moves into the primary cell's own sm:hidden line.
export const HIDE_BELOW_SM = 'hidden sm:table-cell'

// A UTable column's own `meta` for a money or quantity column (0032, K-101): one shape, not a
// copy in every screen that has one. Figures line up digit under digit, so the column is mono.
export const RIGHT_ALIGNED = { class: { td: 'text-right whitespace-nowrap font-mono' } }

// A column of row actions still needs a header for somebody who hears the table rather than sees
// it; the word is hidden, never absent (K-123 criterion 9).
export const ACTIONS_HEADER = (): VNode => h('span', { class: 'sr-only' }, 'Actions')
