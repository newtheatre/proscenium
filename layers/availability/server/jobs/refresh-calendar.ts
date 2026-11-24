// One calendar connection's refresh (I5), on the bulk lane.
import { defineJob } from '#kit'
import { refreshJob } from '../calendars'

export default defineJob<{ connectionId: string }>(async (payload, unit) => {
  await refreshJob(unit, payload.connectionId)
})
