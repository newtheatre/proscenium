// What was kept: sales less refunds. From Box office's own accounts in the ledger.
import { defineMeasure } from '#kit'
import { ABILITY, PERFORMANCE_KEYS, net, sumMoney } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.net',
  unit: 'money',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  read: query => sumMoney(query, net),
})
