// A gift's title, by its reference once received, never by its donor.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ reference: string | null }>('SELECT reference FROM fundraising_donations WHERE id = ?', id)
    return row ? { title: row.reference ? `Gift ${row.reference}` : 'Gift not yet received', to: `/console/fundraising/donations/${id}` } : null
  },
}
