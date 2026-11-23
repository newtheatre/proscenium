import type { ContextMenuItem, DropdownMenuItem } from '@nuxt/ui'
import type { InjectionKey } from 'vue'

type Items = DropdownMenuItem[] | DropdownMenuItem[][]

/** How a row's RowActions tells the row what its menu holds, so the right-click menu is the same one. */
export const ROW_MENU: InjectionKey<(items: () => Items) => () => void> = Symbol('core:row-menu')

/**
 * A row's right-click menu: what its ellipsis menu offers, then "Open in a new tab" where the row
 * is a link. A row with no actions has none, and the browser's own menu shows.
 */
export function rowMenu(items: Items | undefined, to: string | undefined, openLabel: string): ContextMenuItem[][] {
  const list = items ?? []
  const groups = (Array.isArray(list[0]) ? list as DropdownMenuItem[][] : [list as DropdownMenuItem[]]).filter(group => group.length)
  if (!groups.length) return []
  const opening = to ? [[{ label: openLabel, icon: 'i-lucide-external-link', to, target: '_blank' }]] : []
  return [...groups, ...opening] as ContextMenuItem[][]
}
