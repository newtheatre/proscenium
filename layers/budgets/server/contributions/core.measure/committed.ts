// What approved spending requests and sub-budgets hold on those lines (BC-35).
import { defineMeasure } from '#kit'
import { BY, lineLevel } from '../../measures'

export default defineMeasure({
  label: 'budgets.measures.committed',
  unit: 'money',
  combine: 'level',
  by: [...BY],
  ability: 'budgets.budget.view',
  read: query => lineLevel(query, 'committedMinor'),
})
