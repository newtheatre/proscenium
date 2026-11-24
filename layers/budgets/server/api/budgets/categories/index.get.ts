// The categories money is spent on (BC-03), and the expense accounts given to Budgets that they can name.
import { can, defineRoute } from '#kit'
import { accountsOf } from '#modules/finance'
import { listCategories } from '../../../categories'

export default defineRoute({ ability: 'budgets.budget.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  categories: await listCategories(),
  accounts: (await accountsOf('budgets', 'expense')).map(a => ({ id: a.id, code: a.code, name: a.name, systemKey: a.systemKey })),
  canManage: (await can(actor, 'budgets.category.manage')).allowed,
}))
