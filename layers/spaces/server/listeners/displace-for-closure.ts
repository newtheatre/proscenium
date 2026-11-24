// L2: a blocking closure bumps the room bookings in its scope and declines the requests. The scope
// is core's, worked out in the statement (closureSpaces); a public holiday does nothing.
import { defineListener } from '#kit'
import { displace } from '../displace'

export default defineListener(async (event, unit) => {
  if (!event.payload.blocksPerformances) return
  const d = { reason: 'closure' as const, closureId: event.payload.closureId as string }
  if ((await displace(unit, d)).more) unit.enqueue('spaces.clear-window', d)
})
