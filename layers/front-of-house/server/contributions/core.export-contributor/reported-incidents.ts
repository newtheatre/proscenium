// A person's download holds the incidents they reported, in their own words. The registry already
// finds their assignments and their own rows on incidents; others' welfare details are never in it.
import { all } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { reference } from '../../incidents'

export default {
  async export(subject: { accountId: string, emails: string[] }) {
    const rows = await all<{ year: number, number: number, kind: string, state: string, occurred_at: number, what_happened: string, immediate_action: string | null }>(
      `SELECT year, number, kind, state, occurred_at, what_happened, immediate_action FROM front_of_house_incidents WHERE reported_by IN (${accountScopeSql('?1')}) ORDER BY year, number`, subject.accountId)
    if (!rows.length) return []
    const incidents = rows.map(r => ({ reference: reference(r.year, r.number), kind: r.kind, state: r.state, occurredAt: new Date(r.occurred_at).toISOString(), whatHappened: r.what_happened, immediateAction: r.immediate_action }))
    return [{ path: 'incidents-reported.json', title: 'Incidents you reported', bytes: JSON.stringify(incidents, null, 2) }]
  },
}
