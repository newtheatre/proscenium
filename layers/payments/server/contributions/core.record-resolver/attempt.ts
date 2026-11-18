// One try at taking a payment, titled by the records its payment was for.
import { first } from '#kit'
import { intentTitle } from '../../owners'

export default {
  async resolve(id: string) {
    const row = await first<{ intent_id: string }>('SELECT intent_id FROM payments_attempts WHERE id = ?', id)
    return row ? intentTitle(row.intent_id, 'Payment for') : null
  },
}
