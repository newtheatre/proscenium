// An outlet's title: its name.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM bar_outlets WHERE id = ?', id)
    return row ? { title: row.name, to: '/console/bar/outlets' } : null
  },
}
