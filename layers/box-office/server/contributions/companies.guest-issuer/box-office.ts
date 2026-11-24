// BO-75: a company's guests get complimentary tickets like any comp, from the band with most room,
// reported as complimentary (L6). The pool's own guard refuses the batch when the house is full.
import { refuse } from '#kit'
import type { UnitView } from '#kit'
import { issueCompOrder } from '../../comps'
import { poolsOf } from '../../setup'

export default {
  async issue(unit: UnitView, request: { performanceId: string, accountId: string, places: number }): Promise<{ orderRef: string }> {
    const band = [...await poolsOf(request.performanceId)].sort((a, b) => (b.capacity - b.claimed) - (a.capacity - a.claimed))[0]
    if (!band) refuse('box-office.comp.bad-band', 'This performance has nothing on sale to issue guest tickets from.', { status: 409, remedy: 'Set up its tickets first.' })
    const confirmed = await issueCompOrder(unit, { performanceId: request.performanceId, bandId: band.bandId, quantity: request.places, accountId: request.accountId })
    return { orderRef: confirmed.orderId }
  },
}
