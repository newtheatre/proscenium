// Sold over capacity, worked out by core group by group.
import { defineMeasure } from '#kit'

export default defineMeasure({
  label: 'seats.measures.fill',
  unit: 'percent',
  combine: 'level',
  by: ['performance', 'day'],
  ability: 'seats.figures.view',
  ratio: { of: 'seats.sold', over: 'seats.capacity' },
})
