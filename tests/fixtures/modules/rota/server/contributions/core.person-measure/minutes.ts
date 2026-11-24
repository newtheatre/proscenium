// Minutes on the rota per person, answered as each test sets it: rows, a throw or a bad answer.
import { definePersonMeasure, type PersonMeasureQuery, type PersonRow } from '#kit'

export const minutes: { answer: 'rows' | 'throw' | { rows: unknown[] }, rows: PersonRow[], asked: PersonMeasureQuery[] } = { answer: 'rows', rows: [], asked: [] }

export default definePersonMeasure({
  label: 'rota.measures.minutes',
  unit: 'minutes',
  combine: 'sum',
  by: ['performance', 'committee-year'],
  ability: 'rota.hours.view',
  purpose: 'rota.hours',
  side: 'members',
  async read(query) {
    minutes.asked.push(query)
    if (minutes.answer === 'throw') throw new Error('the fixture failed')
    if (typeof minutes.answer === 'object') return minutes.answer as { rows: PersonRow[] }
    return { rows: minutes.rows }
  },
})
