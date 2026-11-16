import type { NavigationMenuItem } from '@nuxt/ui'
import { isCurrent } from './navigation'

interface Entry { id: string, label: string, to: string, icon: string, match?: string, count?: number }
interface Group { id: string, label: string, icon: string, everyday: Entry[], setup: Entry[] }

/**
 * A sidebar's menu: each group of two or more entries is one collapsible section, open when it holds
 * the current page; a group of one is a plain link; no "Everyday" and "Set up" headings (the
 * entries keep their order, everyday first). `onSelect` closes the drawer on a phone.
 */
export function sidebarGroups(groups: Group[], options: { t: (key: string) => string, path: string, onSelect: () => void }): NavigationMenuItem[] {
  const link = (e: Entry, icon = e.icon): NavigationMenuItem => ({ label: options.t(e.label), icon, to: e.to, active: isCurrent(e, options.path), badge: e.count, onSelect: options.onSelect })
  return groups.flatMap((g): NavigationMenuItem[] => {
    const entries = [...g.everyday, ...g.setup]
    if (!entries.length) return []
    if (entries.length === 1) return [link(entries[0]!, g.icon)]
    return [{
      label: options.t(g.label),
      icon: g.icon,
      type: 'trigger',
      defaultOpen: entries.some(e => isCurrent(e, options.path)),
      badge: entries.reduce((n, e) => n + (e.count ?? 0), 0) || undefined,
      children: entries.map(e => link(e, e.icon)),
    }]
  })
}
