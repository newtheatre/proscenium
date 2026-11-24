// The door counter's screen (BO-73): people counted in and out against capacity, beside the tickets
// scanned, whether Out is offered, and the latest presses for undo and correction.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { counterView } from '../../../../headcount'

const RECENT = 12 // not-policy: how many presses the screen lists

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => counterView(record!.id!, RECENT))
