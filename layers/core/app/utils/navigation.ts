import type { NavItem } from '../../shared/navigation'

/** Whether the entry is the current one: its address, or any `match` prefix, covers the page. */
export function isCurrent(item: Pick<NavItem, 'to' | 'match'>, path: string): boolean {
  return [item.to, item.match].some(p => !!p && (path === p || path.startsWith(`${p.replace(/\/$/, '')}/`)))
}
