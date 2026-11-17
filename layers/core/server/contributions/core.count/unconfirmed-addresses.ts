// How many of the person's email addresses wait for their link to be used. My account's "Email
// addresses" entry is marked while there is one, and the overview says which.
import { first } from '#kit'
import type { Count } from '../../points/count'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await first<{ n: number }>('SELECT COUNT(*) AS n FROM core_account_emails WHERE account_id = ? AND verified_at IS NULL', actor.accountId))?.n ?? 0 // exact-account: identity's own table, read as Email addresses reads it, so the mark matches the page
  },
} satisfies Count
