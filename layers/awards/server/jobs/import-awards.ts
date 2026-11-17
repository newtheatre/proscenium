// One share of an awards import, on the bulk lane.
import { defineJob } from '#kit'
import { importShare, type ImportJob } from '../importing'

export default defineJob<ImportJob>(async (payload, unit) => {
  await importShare(unit, payload)
})
