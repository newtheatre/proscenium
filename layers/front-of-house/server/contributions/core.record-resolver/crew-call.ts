// A crew call's title and address (FH-49). It has no parent: it spans many performances.
import { first } from '#kit'

export default {
  async resolve(id: string) {
    const row = await first<{ name: string }>('SELECT name FROM front_of_house_crew_calls WHERE id = ?', id)
    return row ? { title: row.name, to: `/console/front-of-house/crew-calls/${id}` } : null
  },
}
