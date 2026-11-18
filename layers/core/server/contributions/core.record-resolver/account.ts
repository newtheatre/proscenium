// A person's name and page, for the command palette and record fields. A merged-away account
// resolves to its survivor, and an erased person reads as accountLabel names them. One query, since
// access checks on an account ask its resolver for a parent too.
import { first } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'

export default {
  async resolve(id) {
    const row = await first<{ id: string, name: string | null, preferred_name: string | null, anonymised_at: number | null }>(
      `SELECT a.id, a.name, a.preferred_name, a.anonymised_at FROM core_accounts a
        WHERE a.id = (SELECT coalesce(merged_into_id, id) FROM core_accounts WHERE id = ?)`, id)
    if (!row) return null
    const title = row.anonymised_at ? 'Former member' : row.preferred_name || row.name || 'Unnamed person'
    return { title, to: `/console/people/${row.id}` }
  },
} satisfies RecordResolver
