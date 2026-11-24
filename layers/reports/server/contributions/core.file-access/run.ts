// A copy's files are read by whoever may open the copy today (R6).
import type { FileAccess } from '#modules/core'
import { runById } from '../../run-rows'
import { mayOpen } from '../../runs'

export default {
  async canRead(actor, record) {
    const run = await runById(record.id)
    return !!run && await mayOpen(actor, run)
  },
} satisfies FileAccess
