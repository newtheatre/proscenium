// What was paid for tickets and everything sold with them, before refunds. From Box office's own accounts in the ledger.
import { defineMeasure } from '#kit'
import { ABILITY, PERFORMANCE_KEYS, gross, sumMoney } from '../../measures'

export default defineMeasure({
  label: 'box-office.measures.gross',
  unit: 'money',
  combine: 'sum',
  by: PERFORMANCE_KEYS,
  ability: ABILITY,
  read: query => sumMoney(query, gross),
})
