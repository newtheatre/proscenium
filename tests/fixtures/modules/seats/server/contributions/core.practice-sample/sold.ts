// A fixture sample set: tonight's show, a third sold, written after core's base sets.
import { sql } from 'drizzle-orm'
import { definePracticeSample } from '#kit'
import { newId } from '#kit/ids'

export default definePracticeSample({
  after: ['core.tonight'],
  seed(unit, { startedAt }) {
    const id = newId('sp')
    unit.add(sql`INSERT INTO seats_performances (id, title, capacity, sold, starts_at) VALUES (${id}, 'The Practice Play', 9, 3, ${startedAt})`)
    return { show: id }
  },
})
