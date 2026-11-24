// What was kept, less the VAT within it. From Box office's own accounts in the ledger.
import { defineMeasure } from '#kit'
import { ABILITY, PERFORMANCE_KEYS, netOfVat, sumMoney } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.net-of-vat',
  unit: 'money',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  read: query => sumMoney(query, netOfVat),
})
