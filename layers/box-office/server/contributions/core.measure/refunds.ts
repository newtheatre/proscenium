// What was given back. From Box office's own accounts in the ledger.
import { defineMeasure } from '#kit'
import { ABILITY, PERFORMANCE_KEYS, refunds, sumMoney } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.refunds',
  unit: 'money',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  read: query => sumMoney(query, refunds),
})
