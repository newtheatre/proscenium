// A fee's title: what it is for, by its membership's scheme, never the person's name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ membership_id: string, name: string }>('SELECT c.membership_id, s.name FROM membership_fees_charges c JOIN membership_memberships m ON m.id = c.membership_id JOIN membership_schemes s ON s.id = m.scheme_id WHERE c.id = ?', id)
    return row ? { title: `Fee for ${row.name}`, to: `/console/membership/memberships/${row.membership_id}`, parent: { type: 'membership.membership', id: row.membership_id } } : null
  },
}
