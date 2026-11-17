// One share of a members import (MEM-49), on the bulk lane.
import { defineJob } from '#kit'
import { importShare, type ImportJob } from '../importing'

export default defineJob<ImportJob>(async (payload, unit) => {
  await importShare(unit, payload)
})
