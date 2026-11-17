// A membership's title: its scheme's name and the member number, never the person's name (tab 4).
import { first } from '#kit'
import { memberNumber } from '../../memberships'

export default {
  async resolve(id: string) {
    const row = await first<{ scheme_id: string, account_id: string, name: string }>('SELECT m.scheme_id, m.account_id, s.name FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.id = ?', id)
    if (!row) return null
    const number = await memberNumber(row.account_id)
    return { title: number ? `${row.name}, ${number.label}` : row.name, to: `/console/membership/memberships/${id}`, parent: { type: 'membership.scheme', id: row.scheme_id } }
  },
}
