// How the Modules screen names things: a module by its catalogue name, a list of names in a
// sentence ("Finance and Payments"), and the screens a module adds, by their navigation labels.
import { entryLabelKey } from '../../shared/navigation'
import type { ModuleView } from '../utils/modules'

export function useModuleWords() {
  const { t, te } = useT()
  const nameOf = (id: string) => te(`${id}.module.name`) ? t(`${id}.module.name`) : id
  const descriptionOf = (id: string) => te(`${id}.module.description`) ? t(`${id}.module.description`) : undefined
  const listOf = (items: string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(items)
  const screensOf = (m: Pick<ModuleView, 'screens'>) => (m.screens ?? [])
    .filter(s => te(entryLabelKey(s.id)))
    .map(s => ({ id: s.id, menu: s.menu, label: t(entryLabelKey(s.id)), shell: te(`core.modules.dialog.shell.${s.menu}`) ? t(`core.modules.dialog.shell.${s.menu}`) : s.menu }))
  /** The modules still on that need this one: while any are, it cannot be switched off. */
  const keptOnBy = (m: Pick<ModuleView, 'on' | 'requiredBy'>, all: ModuleView[]) => m.on
    ? m.requiredBy.filter(id => all.find(o => o.id === id)?.on)
    : []
  /** Every module still on that needs this one, directly or not, in the order to switch them off: those nothing needs first. */
  const dependantsOf = (m: Pick<ModuleView, 'id' | 'requiredBy'>, all: ModuleView[]) => {
    const order: string[] = []
    const visit = (view: Pick<ModuleView, 'id' | 'requiredBy'>) => {
      for (const id of view.requiredBy) {
        const other = all.find(o => o.id === id)
        if (other?.on && !order.includes(id)) {
          visit(other)
          order.push(id)
        }
      }
    }
    visit(m)
    return order
  }
  /** Everything a module needs, those it needs in turn included. */
  const needsOf = (m: Pick<ModuleView, 'requires'>, all: ModuleView[]) => {
    const seen = new Set<string>()
    const walk = (ids: string[]) => ids.forEach((id) => {
      if (seen.has(id)) return
      seen.add(id)
      walk(all.find(o => o.id === id)?.requires ?? [])
    })
    walk(m.requires)
    return [...seen]
  }
  return { nameOf, descriptionOf, listOf, screensOf, keptOnBy, needsOf, dependantsOf }
}
