// Whether the members' home card has anything to say (AC-7): the person's coming shifts plus the
// published shifts with a place free that they are not on. Eligibility is the card's to judge.
import { first, nowMs, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { LIVE_STATES } from '../../db/schema'

const live = LIVE_STATES.map(s => `'${s}'`).join(', ')

export default {
  async value(actor: Actor) {
    if (!actor.accountId) return 0
    const row = await first<{ coming: number, open: number }>(
      `SELECT
         (SELECT count(*) FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
           WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${live}) AND s.window_closes_at >= ?2) AS coming,
         (SELECT count(*) FROM front_of_house_shifts s WHERE s.state = 'published' AND s.sign_up_closes_at > ?2 AND s.places > s.places_taken
           AND NOT EXISTS (SELECT 1 FROM front_of_house_assignments a WHERE a.shift_id = s.id AND a.state IN (${live}) AND a.account_id IN (${accountScopeSql('?1')}))) AS open`,
      actor.accountId, nowMs())
    return (row?.coming ?? 0) + (row?.open ?? 0)
  },
}
