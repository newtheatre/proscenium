// Capacity filled: tickets issued over capacity, worked out by core group by group.
import { defineMeasure } from '#kit'
import { ABILITY, PERFORMANCE_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.capacity-filled',
  unit: 'percent',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  ratio: { of: 'box-office.tickets-issued', over: 'box-office.capacity' },
})
