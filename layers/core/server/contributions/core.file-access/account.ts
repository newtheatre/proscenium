// Files on an account, such as the data download (ID-15): only the person reads them, signed in as
// themself. Staff never open a person's download; a request made another way is answered by the
// person signing in with the emailed link.
import type { FileAccess } from '../../points/file-access'
import { canonicalAccount } from '../../identity/accounts'

export default {
  async canRead(actor, record) {
    if (actor.kind !== 'person' || !actor.accountId) return false
    return await canonicalAccount(record.id) === actor.accountId
  },
} satisfies FileAccess
