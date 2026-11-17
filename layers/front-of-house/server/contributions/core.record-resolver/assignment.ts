// An assignment's parent is its shift. Its title names the duty, never the person.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ shift_id: string, duty: string }>(
      `SELECT a.shift_id, d.name AS duty FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
        JOIN front_of_house_duties d ON d.id = s.duty_id WHERE a.id = ?`, id)
    if (!row) return null
    return { title: row.duty, to: `/members/front-of-house/shifts/${row.shift_id}`, parent: { type: 'front-of-house.shift', id: row.shift_id } }
  },
}
