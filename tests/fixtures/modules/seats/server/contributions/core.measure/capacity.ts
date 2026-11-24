// The fixture's seats on sale, the base of its fill figure.
import { defineMeasure, type MeasureRow } from '#kit'

export const capacity: { rows: MeasureRow[] } = { rows: [] }

export default defineMeasure({
  label: 'seats.measures.capacity',
  unit: 'count',
  combine: 'sum',
  by: ['performance', 'day'],
  ability: 'seats.figures.view',
  async read() {
    return { rows: capacity.rows }
  },
})
