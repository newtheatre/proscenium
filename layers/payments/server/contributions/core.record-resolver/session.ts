// A till session's title: the till it was opened at.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ point_label: string }>('SELECT point_label FROM payments_sessions WHERE id = ?', id)
    return row ? { title: `Till session at ${row.point_label}`, to: '/console/payments/sessions' } : null
  },
}
