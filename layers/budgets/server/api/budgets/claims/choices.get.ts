// What a claim's items may be charged to: spending lines of approved budgets and the live categories.
import { defineRoute } from '#kit'
import { offeredLines } from '../../../requests'
import { listCategories } from '../../../categories'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async () => ({
  lines: await offeredLines(),
  categories: (await listCategories()).filter(c => !c.archivedAt).map(c => ({ id: c.id, name: c.name, description: c.description })),
}))
