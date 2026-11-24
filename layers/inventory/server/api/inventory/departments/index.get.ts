// Kit departments with their categories (INV-05, INV-06), the active inspection kinds a category
// may carry, and the starting departments offered while there are none.
import { defineRoute } from '#kit'
import { listCategories, listDepartments } from '../../../departments'
import { listKinds } from '../../../kinds'
import { STARTING_DEPARTMENTS } from '../../../../shared/setup'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'default' }, async () => {
  const [departments, categories, kinds] = await Promise.all([listDepartments(), listCategories(), listKinds()])
  return {
    departments,
    categories,
    kinds: kinds.filter(k => k.state === 'active').map(k => ({ id: k.id, name: k.name })),
    starting: departments.length ? [] : STARTING_DEPARTMENTS,
  }
})
