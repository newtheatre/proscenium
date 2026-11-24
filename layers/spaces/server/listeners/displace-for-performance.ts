// L1: a performance scheduled, rescheduled or moved into a space bumps the room bookings in its way
// and declines the requests; the scheduler was shown the count first (core.change-impact).
import { defineListener } from '#kit'
import { displace } from '../displace'

export default defineListener(async (event, unit) => {
  const d = { reason: 'performance' as const, performanceId: event.payload.performanceId as string }
  if ((await displace(unit, d)).more) unit.enqueue('spaces.clear-window', d)
})
