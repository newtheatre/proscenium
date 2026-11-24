// The fixture's money figure: each row carries its currency.
import { defineMeasure, type MeasureRow } from '#kit'

export const takings: { rows: MeasureRow[] } = { rows: [] }

export default defineMeasure({
  label: 'seats.measures.takings',
  unit: 'money',
  combine: 'sum',
  by: ['performance'],
  ability: 'seats.figures.view',
  async read() {
    return { rows: takings.rows }
  },
})
