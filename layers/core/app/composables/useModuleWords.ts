// How the Modules screen names things: a module by its catalogue name, a list of names in a
// sentence ("Finance and Payments"), and the screens a module adds, by their navigation labels.
import { entryLabelKey } from '../../shared/navigation'
import type { ModuleView } from '../utils/modules'

export function useModuleWords() {
  const { t, te } = useT()
  // A name a module lists that is a part of the platform rather than a module, such as Communications, is named as its menu group is.
  const nameOf = (id: string) => te(`${id}.module.name`) ? t(`${id}.module.name`) : te(`core.navigation.groups.${id}.label`) ? t(`core.navigation.groups.${id}.label`) : id
  const descriptionOf = (id: string) => te(`${id}.module.description`) ? t(`${id}.module.description`) : undefined
  const listOf = (items: string[]) => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(items)
  const screensOf = (m: Pick<ModuleView, 'screens'>) => (m.screens ?? [])
    .filter(s => te(entryLabelKey(s.id)))
    .map(s => ({ id: s.id, label: t(entryLabelKey(s.id)), shell: te(`core.modules.dialog.shell.${s.menu}`) ? t(`core.modules.dialog.shell.${s.menu}`) : s.menu }))
  return { nameOf, descriptionOf, listOf, screensOf }
}
