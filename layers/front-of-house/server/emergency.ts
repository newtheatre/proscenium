// Emergency cards (part 3; FH-26): one per venue, kept on the device so it opens with no signal. It
// holds routes, the assembly point and who to call by role, never a private number.
import { all, first, newId, nowMs, today, type UnitView } from '#kit'

export interface EmergencyCard { venueId: string, venueName: string, body: string, reviewedOn: string, updatedAt: number }

export async function listCards(): Promise<EmergencyCard[]> {
  const rows = await all<{ venue_id: string, venue_name: string, body: string, reviewed_on: string, updated_at: number }>(
    'SELECT e.venue_id, v.name AS venue_name, e.body, e.reviewed_on, e.updated_at FROM front_of_house_emergency_cards e JOIN core_venues v ON v.id = e.venue_id ORDER BY v.name')
  return rows.map(r => ({ venueId: r.venue_id, venueName: r.venue_name, body: r.body, reviewedOn: r.reviewed_on, updatedAt: r.updated_at }))
}

export async function getCard(venueId: string): Promise<EmergencyCard | null> {
  return (await listCards()).find(c => c.venueId === venueId) ?? null
}

/**
 * Writes a venue's card. The review date becomes today only when the editor says they reviewed the
 * whole card, or when the card is new; a small fix leaves it as it was.
 */
export async function saveCard(unit: UnitView, input: { venueId: string, body: string, reviewed: boolean, by: string }): Promise<void> {
  const at = nowMs()
  const day = await today()
  const existing = await first('SELECT 1 AS one FROM front_of_house_emergency_cards WHERE venue_id = ?', input.venueId)
  unit.add({
    sql: `INSERT INTO front_of_house_emergency_cards (id, venue_id, body, reviewed_on, reviewed_by, created_at, updated_at)
      SELECT ?, v.id, ?, ?, ?, ?, ? FROM core_venues v WHERE v.id = ?
      ON CONFLICT (venue_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at${input.reviewed ? ', reviewed_on = excluded.reviewed_on, reviewed_by = excluded.reviewed_by' : ''}`,
    params: [newId('emg'), input.body, day, input.by, at, at, input.venueId],
  }).expect(1, { code: 'core.not-found', reason: 'There is no such venue.' })
  unit.audit({ action: existing ? 'update' : 'create', detail: { emergencyCard: input.venueId, reviewed: input.reviewed || !existing } })
}
