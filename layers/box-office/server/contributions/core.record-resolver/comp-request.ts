// A complimentary request's title, address and parent: its performance, so a grant on a performance
// or its production reaches its requests (Box office specification, part 7, "Record types").
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ performance_id: string, quantity: number }>('SELECT performance_id, quantity FROM box_office_comp_requests WHERE id = ?', id)
    if (!row) return null
    return { title: `Complimentary tickets (${row.quantity})`, to: '/console/box-office/comps', parent: { type: 'core.performance', id: row.performance_id } }
  },
}
