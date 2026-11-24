// The items list (S1, INV-15): every item of the departments this person may see, with what the
// filters need. Holding inventory.item.view on any one department is enough to open it.
import { defineRoute, refuse } from '#kit'
import { listCategories } from '../../../departments'
import { listLocations } from '../../../locations'
import { departmentsFor, dueWindow, listItems } from '../../../reading'
import type { ItemsList } from '../../../../shared/items'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const departments = await departmentsFor(actor, 'inventory.item.view')
  if (!departments.length) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403, remedy: 'Ask an administrator for this permission.' })
  const editable = (await departmentsFor(actor, 'inventory.item.edit')).map(d => d.id)
  const ids = departments.map(d => d.id)
  const [items, categories, locations, window] = await Promise.all([listItems(ids), listCategories(), listLocations(), dueWindow()])
  return {
    items,
    ...window,
    departments,
    editable,
    categories: categories.filter(c => c.state === 'active' && ids.includes(c.departmentId)).map(c => ({ id: c.id, name: c.name, departmentId: c.departmentId })),
    locations: locations.filter(l => l.state === 'active').map(l => ({ id: l.id, name: l.name, parentId: l.parentId })),
  } satisfies ItemsList
})
