// S3 Bills: drafts, then those waiting for approval, then approved by due date, then paid.
import { can, defineRoute } from '#kit'
import { listBills } from '../../../bills'

export default defineRoute({ ability: 'invoicing.bill.view', rateLimit: 'default' }, async (_event, { actor }) => ({
  bills: await listBills(actor),
  canLog: (await can(actor, 'invoicing.bill.log')).allowed,
  canApprove: (await can(actor, 'invoicing.bill.approve')).allowed,
}))
