// A shift's title, address and parent: its performance, so a grant on a performance or its
// production reaches its shifts (part 4, "Record types").
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ performance_id: string | null, title: string | null, duty: string }>(
      'SELECT s.performance_id, s.title, d.name AS duty FROM front_of_house_shifts s JOIN front_of_house_duties d ON d.id = s.duty_id WHERE s.id = ?', id)
    if (!row) return null
    return {
      title: row.title ? `${row.duty}: ${row.title}` : row.duty,
      to: `/members/front-of-house/shifts/${id}`,
      ...(row.performance_id ? { parent: { type: 'core.performance', id: row.performance_id } } : {}),
    }
  },
}
