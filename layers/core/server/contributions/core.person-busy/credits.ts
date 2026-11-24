// Core's own busy time (C-66): a person credited on a production is busy for each of its scheduled
// or draft performances, doors (or start) to end, firm once scheduled; credits of merged accounts count.
import { sql } from 'drizzle-orm'
import { inAccountScope, useDb } from '#kit'
import type { PersonBusy } from '../../points/person-busy'

export default {
  async busy({ accountIds, from, to }) {
    const rows = await useDb().all<{ account_id: string, id: string, starts: number, ends_at: number, state: string }>(sql`
      SELECT DISTINCT a.value AS account_id, p.id, COALESCE(p.doors_at, p.starts_at) AS starts, p.ends_at, p.state
      FROM json_each(${JSON.stringify(accountIds)}) a
      JOIN core_production_credits c ON ${inAccountScope('c.account_id', sql`a.value`)}
      JOIN core_performances p ON p.production_id = c.production_id
      WHERE p.state IN ('scheduled', 'draft')
        AND COALESCE(p.doors_at, p.starts_at) < ${to} AND p.ends_at > ${from}
      ORDER BY a.value, starts`)
    return rows.map(r => ({
      accountId: r.account_id,
      kind: 'performance',
      from: r.starts,
      to: r.ends_at,
      firm: r.state === 'scheduled',
      labelKey: 'core.person-busy.performance',
      record: { type: 'core.performance', id: r.id },
    }))
  },
} satisfies PersonBusy
