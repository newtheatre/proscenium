import type { NavigationMenuItem } from '@nuxt/ui'
import { resolveEntry } from '../../shared/navigation'

interface Entry { id: string, label: string, to: string, icon: string, match?: string, count?: number, unlisted?: boolean }
interface Group { id: string, label: string, icon: string, everyday: Entry[], setup: Entry[] }

/**
 * A sidebar's menu: each group of two or more entries is one collapsible section, open when it holds
 * the current page; a group of one is a plain link; no "Everyday" and "Set up" headings (the
 * entries keep their order, everyday first). `onSelect` closes the drawer on a phone.
 */
export function sidebarGroups(groups: Group[], options: { t: (key: string) => string, path: string, onSelect: () => void }): NavigationMenuItem[] {
  // An unlisted entry (Merges) is not drawn: its page shows the listed entry it sits below as current.
  const listed = (g: Group) => [...g.everyday, ...g.setup].filter(e => !e.unlisted)
  // One entry is current: the one whose address covers the page most closely, so Who holds what is not Accounts too.
  const current = resolveEntry(groups.flatMap(listed), options.path)?.id
  const link = (e: Entry, icon = e.icon): NavigationMenuItem => ({ label: options.t(e.label), icon, to: e.to, active: e.id === current, badge: e.count || undefined, onSelect: options.onSelect })
  return groups.flatMap((g): NavigationMenuItem[] => {
    const entries = listed(g)
    if (!entries.length) return []
    if (entries.length === 1) return [link(entries[0]!, g.icon)]
    return [{
      label: options.t(g.label),
      icon: g.icon,
      type: 'trigger',
      defaultOpen: entries.some(e => e.id === current),
      badge: entries.reduce((n, e) => n + (e.count ?? 0), 0) || undefined,
      children: entries.map(e => link(e, e.icon)),
    }]
  })
}
