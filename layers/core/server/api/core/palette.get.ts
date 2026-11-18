// What the command palette may offer this viewer besides the shells' menus: the set-up screens that
// are tabs of a module's page in Admin (Venues and spaces, Seasons…), which no menu lists; the record
// types it may search; and the common actions it may run. All are filtered by ability.
import { defineRoute, usePoint } from '#kit'
import { declaredEntries, holds, mayOpen } from '../../interface/navigation'
import { isSignedIn } from '../../interface/viewer'
import { entryLabelKey, moduleTabOf } from '../../../shared/navigation'

interface Source { id: string, record: string, ability: string | string[], route: string, shells: string[] }
interface Action { id: string, to: string, icon: string, ability: string | string[], keywords?: string }

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (!isSignedIn(actor)) return { screens: [], sources: [], actions: [] }
  // A module's set-up screens (not its pages of settings, which the settings search finds, nor About).
  const screens: { id: string, labelKey: string, moduleKey: string, to: string, icon: string }[] = []
  for (const entry of await declaredEntries()) {
    const module = moduleTabOf(entry)
    if (!module || entry.settingsPage || entry.id.startsWith('core.modules.about.')) continue
    if (!holds(await mayOpen(actor, entry))) continue
    screens.push({ id: entry.id, labelKey: entry.label ?? entryLabelKey(entry.id), moduleKey: `${module}.module.name`, to: entry.to, icon: entry.icon })
  }
  const sources: { id: string, record: string, route: string }[] = []
  for (const { value } of await usePoint<Source>('core.search-source')) {
    if (value.shells.includes('console') && holds(await mayOpen(actor, { ability: value.ability }))) sources.push({ id: value.id, record: value.record, route: value.route })
  }
  const actions: { id: string, to: string, icon: string, labelKey: string, keywordsKey?: string }[] = []
  for (const { module, value } of await usePoint<Action>('core.quick-action')) {
    if (!holds(await mayOpen(actor, { ability: value.ability }))) continue
    const name = value.id.slice(value.id.indexOf('.') + 1)
    actions.push({ id: value.id, to: value.to, icon: value.icon, labelKey: `${module}.quick-actions.${name}.label`, keywordsKey: value.keywords })
  }
  return { screens, sources, actions }
})
