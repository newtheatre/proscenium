// Find a person by name or address (the picker). Returns a name and enough to tell two people
// apart, never their contact details.
import { z } from 'zod'
import { all, defineRoute } from '#kit'
import { normaliseAddress } from '../../identity/accounts'

const PAGE = 20 // not-policy: a picker shows a short list

export default defineRoute({
  ability: 'core.account.search',
  rateLimit: 'default',
  input: z.object({ q: z.string().trim().min(2).max(120) }), // not-policy: a search needs two characters
}, async (_event, { input }) => {
  const like = `%${input.q.replace(/[%_\\]/g, c => `\\${c}`)}%`
  const rows = await all<{ id: string, name: string | null, preferred_name: string | null, origin: string, created_at: number, first_signed_in_at: number | null, disabled_at: number | null }>(
    `SELECT DISTINCT a.id, a.name, a.preferred_name, a.origin, a.created_at, a.first_signed_in_at, a.disabled_at
       FROM core_accounts a LEFT JOIN core_account_emails e ON e.account_id = a.id
      WHERE a.merged_into_id IS NULL AND a.anonymised_at IS NULL
        AND (a.name LIKE ? ESCAPE '\\' OR a.preferred_name LIKE ? ESCAPE '\\' OR e.address = ?)
      ORDER BY coalesce(a.preferred_name, a.name) LIMIT ${PAGE}`,
    like, like, normaliseAddress(input.q),
  )
  return {
    people: rows.map(r => ({ id: r.id, label: r.preferred_name || r.name || 'Unnamed person', name: r.name, since: r.created_at, claimed: !!r.first_signed_in_at, disabled: !!r.disabled_at })),
  }
})
