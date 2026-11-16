// A fixture for core.file-access: a performance's files are readable by the accounts tests list.
import type { FileAccess } from '#modules/core'

export const readers = new Set<string>()

export default {
  async canRead(actor, record) {
    return !!actor.accountId && readers.has(`${record.id}:${actor.accountId}`)
  },
} satisfies FileAccess
