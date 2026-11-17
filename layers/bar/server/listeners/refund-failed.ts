// A refund of the bar's part failed or was declined: its reversals let go of what they held.
import { defineListener } from '#kit'
import { released } from '../refunds'

export default defineListener(async (event, unit) => {
  if ((event.payload.owner as { moduleId?: string } | undefined)?.moduleId === 'bar') released(unit, event.payload.refundId as string)
})
