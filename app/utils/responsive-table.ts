import { h } from 'vue'
import type { VNode } from 'vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import { UButton, UDropdownMenu } from '#components'

// A secondary column at 390px pushes every row action off-screen behind a horizontal scroll
// (issue 922). Hidden below sm, its content moves into the primary cell's own sm:hidden line.
export const HIDE_BELOW_SM = 'hidden sm:table-cell'

// A UTable column's own `meta` for a money or quantity column (0032, K-101): one shape, not a
// copy in every screen that has one. Figures line up digit under digit, header and all.
export const RIGHT_ALIGNED = { class: { th: 'text-right', td: 'text-right whitespace-nowrap font-mono' } }

// The same figure column where a phone drops it and the primary cell's own line carries it.
export const RIGHT_ALIGNED_HIDE_BELOW_SM = { class: { th: `${HIDE_BELOW_SM} text-right`, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } }

// A column of row actions ends the row as a figure does, but its buttons keep the body face.
export const ACTIONS_COLUMN = { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } }

// A column of row actions still needs a header for somebody who hears the table rather than sees
// it; the word is hidden, never absent (K-123 criterion 9).
export const ACTIONS_HEADER = (): VNode => h('span', { class: 'sr-only' }, 'Actions')

// A row keeps at most three actions in line and puts the rest here (K-123 criterion 10). The
// trigger answers to `more-<id>`, which is what a browser test presses to reach them.
export function rowOverflow(id: string, items: DropdownMenuItem[]): VNode | null {
  if (items.length === 0) return null
  return h(UDropdownMenu, { items, content: { align: 'end' } }, () =>
    h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'icon': 'i-lucide-ellipsis',
      'aria-label': 'More actions',
      'data-test': `more-${id}`,
    }))
}
