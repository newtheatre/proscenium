import type { NavGroup, NavItem, ShellName } from '../../shared/navigation'

export interface ShellNavigation { items: NavItem[], groups: NavGroup[] }

/** The menu of one shell for the viewer. The console's comes as groups, each split into everyday and set-up. */
export function useNavigation(shell: ShellName) {
  return useAPI<ShellNavigation>('/api/core/navigation', {
    query: { shell },
    key: `core:navigation:${shell}`,
    default: () => ({ items: [], groups: [] }),
  })
}
