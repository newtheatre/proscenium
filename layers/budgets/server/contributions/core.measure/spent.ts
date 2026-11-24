// Ledger entries charged to a budget line in the period, claims and bills alike (BC-35).
import { defineMeasure } from '#kit'
import { BY, spent } from '../../measures'

export default defineMeasure({
  label: 'budgets.measures.spent',
  unit: 'money',
  combine: 'sum',
  by: [...BY, 'month'],
  ability: 'budgets.budget.view',
  read: spent,
})
