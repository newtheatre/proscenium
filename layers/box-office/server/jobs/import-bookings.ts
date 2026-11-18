// One share of an import of bookings from another system, on the bulk lane.
import { defineJob } from '#kit'
import { importShare, type ImportJob } from '../importing'

export default defineJob<ImportJob>(async (payload) => {
  await importShare(payload)
})
