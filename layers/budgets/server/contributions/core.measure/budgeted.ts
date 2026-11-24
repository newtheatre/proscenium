// What approved budgets meeting the period plan to spend, line by line (BC-35).
import { defineMeasure } from '#kit'
import { BY, lineLevel } from '../../measures'

export default defineMeasure({
  label: 'budgets.measures.budgeted',
  unit: 'money',
  combine: 'level',
  by: [...BY],
  ability: 'budgets.budget.view',
  read: query => lineLevel(query, 'budgetedMinor'),
})
