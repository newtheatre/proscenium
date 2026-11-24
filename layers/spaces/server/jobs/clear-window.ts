// The rest of a displacement too large for one set (part 3, "Many bookings at once"): each run moves
// the soonest still in the way and queues itself again until none is left. Safe to repeat.
import { defineJob } from '#kit'
import { displace, type Displacement } from '../displace'

export default defineJob<Displacement>(async (payload, unit) => {
  if ((await displace(unit, payload)).more) unit.enqueue('spaces.clear-window', payload)
})
