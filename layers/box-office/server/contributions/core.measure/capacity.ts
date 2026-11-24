// Capacity: the seats on sale at each performance, every band's pool added up.
import { defineMeasure } from '#kit'
import { ABILITY, countCapacity, PERFORMANCE_KEYS } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.capacity',
  unit: 'count',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  read: countCapacity,
})
