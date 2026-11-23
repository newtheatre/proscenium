import type { ContextMenuItem, DropdownMenuItem } from '@nuxt/ui'
import type { InjectionKey } from 'vue'

type Items = DropdownMenuItem[] | DropdownMenuItem[][]

/**
 * How a row's RowActions tells the row what its menu holds, so the right-click menu is the same one.
 * `shape` is reactive and changes only when the menu's words do; `items` is read without tracking.
 */
export interface RowMenuSource { shape: () => string, items: () => Items }
export const ROW_MENU: InjectionKey<(source: RowMenuSource) => () => void> = Symbol('core:row-menu')

/** A menu's words and states without its handlers: equal for two renders of the same menu. */
export const menuShape = (items: Items): string => JSON.stringify(items, (_key, value: unknown) => typeof value === 'function' ? undefined : value)

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
