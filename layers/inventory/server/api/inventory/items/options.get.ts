// What the add and edit forms choose from (S3): the categories this person may add to, with the
// inspections each brings, the active locations, and the theatre's kit tags.
import { defineRoute, refuse } from '#kit'
import { listTerms } from '#modules/core'
import { listCategories } from '../../../departments'
import { listKinds } from '../../../kinds'
import { listLocations } from '../../../locations'
import { departmentsFor } from '../../../reading'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const departments = await departmentsFor(actor, 'inventory.item.edit')
  if (!departments.length) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403, remedy: 'Ask an administrator for this permission.' })
  const ids = departments.map(d => d.id)
  const [categories, kinds, locations, tags] = await Promise.all([listCategories(), listKinds(), listLocations(), listTerms('inventory.tag')])
  const kindName = new Map(kinds.map(k => [k.id, k.name]))
  return {
    departments,
    categories: categories.filter(c => c.state === 'active' && ids.includes(c.departmentId))
      .map(c => ({ id: c.id, name: c.name, departmentId: c.departmentId, kinds: c.kindIds.map(id => kindName.get(id) ?? '').filter(Boolean), requirements: c.requirements })),
    locations: locations.filter(l => l.state === 'active').map(l => ({ id: l.id, name: l.name, parentId: l.parentId })),
    tags: tags.map(t => ({ id: t.id, label: t.label })),
  }
})
