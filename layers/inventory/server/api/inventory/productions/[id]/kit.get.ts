// The production's Kit tab and fact (S15): its pull lists and loans, all of them for its own people,
// otherwise those of the departments a person may see; and the departments a list may be started with.
import { getRouterParam } from 'h3'
import { all, can, defineRoute, refuse, today } from '#kit'
import type { ProductionKit } from '../../../../../shared/pull-lists'
import { departmentsFor } from '../../../../reading'
import { loansForProduction, productionDueBack } from '../../../../pull-lists'

const OPEN = new Set(['draft', 'requested', 'approved', 'out'])

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const productionId = getRouterParam(event, 'id')!
  const canStart = (await can(actor, 'inventory.pull-list.edit', ['core.production', productionId])).allowed
  const seen = canStart ? null : new Set((await departmentsFor(actor, 'inventory.loan.view')).map(d => d.id))
  if (seen && !seen.size) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403, remedy: 'Ask an administrator for this permission.' })
  const lists = (await loansForProduction(productionId)).filter(l => !seen || seen.has(l.departmentId))
  const open = new Set(lists.filter(l => OPEN.has(l.state)).map(l => l.departmentId))
  const startable = canStart ? (await all<{ id: string, name: string }>('SELECT id, name FROM inventory_departments WHERE state = \'active\' ORDER BY sort, lower(name)')).filter(d => !open.has(d.id)) : []
  return { lists, startable, canStart, dueBackOn: await productionDueBack(productionId), today: await today() } satisfies ProductionKit
})
