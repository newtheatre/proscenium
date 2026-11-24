// Borrow kit (S12, INV-20): what members may borrow, and how many of each are free over their dates.
import { defineRoute } from '#kit'
import { windowInput } from '../../../shared/borrowing'
import { catalogue, requireBrowsing } from '../../borrowing'

export default defineRoute({ ability: 'inventory.catalogue.browse', rateLimit: 'default', input: windowInput }, async (_event, { input }) => {
  await requireBrowsing()
  return { items: await catalogue(input) }
})
