// What the command palette may offer this viewer besides screens (which come from the navigation):
// the record types it may search, and the common actions it may run. Both are filtered by ability.
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import { isSignedIn } from '../../interface/viewer'

interface Source { id: string, record: string, ability: string | string[], route: string, shells: string[] }
interface Action { id: string, to: string, icon: string, ability: string | string[], keywords?: string }

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (!isSignedIn(actor)) return { sources: [], actions: [] }
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
  return { sources, actions }
})
