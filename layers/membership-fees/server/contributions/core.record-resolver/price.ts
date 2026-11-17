// A price's title: the scheme it is for and the day it applies from.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ scheme_id: string, name: string, from_date: string }>('SELECT p.scheme_id, s.name, p.from_date FROM membership_fees_prices p JOIN membership_schemes s ON s.id = p.scheme_id WHERE p.id = ?', id)
    return row ? { title: `Price for ${row.name} from ${row.from_date}`, to: '/admin/modules/membership-fees/prices', parent: { type: 'membership.scheme', id: row.scheme_id } } : null
  },
}
