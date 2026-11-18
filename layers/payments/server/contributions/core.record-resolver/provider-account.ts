// A provider account's title: the name it was given, such as "Card machine".
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ label: string }>('SELECT label FROM payments_provider_accounts WHERE id = ?', id)
    return row ? { title: row.label, to: '/admin/modules/payments/providers' } : null
  },
}
