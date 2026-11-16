import type { NavGroup, NavItem, ShellName } from '../../shared/navigation'

export interface ShellNavigation { items: NavItem[], groups: NavGroup[] }

/** The menu of one shell for the viewer. The console's comes as groups, each split into everyday and set-up. */
export function useNavigation(shell: ShellName) {
  return useFetch<ShellNavigation>('/api/core/navigation', {
    query: { shell },
    key: `core:navigation:${shell}`,
    default: () => ({ items: [], groups: [] }),
  })
}

/** Whether the entry is the current one: its address, or any `match` prefix, covers the page. */
export function isCurrent(item: Pick<NavItem, 'to' | 'match'>, path: string): boolean {
  return [item.to, item.match].some(p => !!p && (path === p || path.startsWith(`${p.replace(/\/$/, '')}/`)))
}
