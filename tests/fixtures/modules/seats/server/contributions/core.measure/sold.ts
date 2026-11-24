// The fixture's tickets sold, answered as each test sets it: rows, a throw, a stall or a bad answer.
import { defineMeasure, type MeasureQuery, type MeasureRow } from '#kit'

export const sold: { answer: 'rows' | 'throw' | 'stall' | 'unsupported' | { rows: unknown[] }, rows: MeasureRow[], asked: MeasureQuery[] } = { answer: 'rows', rows: [], asked: [] }

export default defineMeasure({
  label: 'seats.measures.sold',
  unit: 'count',
  combine: 'sum',
  by: ['performance', 'day', 'seats.band'],
  filters: ['seats.band'],
  ability: 'seats.figures.view',
  async read(query) {
    sold.asked.push(query)
    if (sold.answer === 'throw') throw new Error('the fixture failed')
    if (sold.answer === 'stall') return new Promise(() => {})
    if (sold.answer === 'unsupported') return 'unsupported'
    if (typeof sold.answer === 'object') return sold.answer as { rows: MeasureRow[] }
    return { rows: sold.rows }
  },
})
