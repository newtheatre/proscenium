// Loans (S4, INV-19, INV-21): every loan of the departments this person may see the loans of, and
// the departments they may lend from straight away.
import { defineRoute, refuse } from '#kit'
import { listLoans } from '../../../loan-reading'
import { departmentsFor } from '../../../reading'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const departments = await departmentsFor(actor, 'inventory.loan.view')
  if (!departments.length) refuse('core.access.denied', 'You do not have permission to do this.', { status: 403, remedy: 'Ask an administrator for this permission.' })
  const lending = await departmentsFor(actor, 'inventory.loan.approve')
  return { loans: await listLoans(departments.map(d => d.id)), departments, lending }
})
