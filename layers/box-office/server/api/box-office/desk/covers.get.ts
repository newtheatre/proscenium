// Selling a pass at the till to someone found (Matt, 19 November): the tickets they already have for
// other shows it covers, for the seller to offer. Those ticked become its entries once the sale is made.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { coverChoicesOnBuying } from '../../../pass-covers'

const id = z.string().min(1).max(64) // not-policy: an id

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({ performanceId: id, passTypeId: id, passPriceId: id, accountId: id, entry: z.enum(['true', 'false']).optional() }).strict(),
}, async (_event, { input }) => coverChoicesOnBuying(input.performanceId, input.passTypeId, input.passPriceId, 1, input.accountId, undefined, input.entry !== 'false'))
