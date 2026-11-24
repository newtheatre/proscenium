// What the claims waiting for a decision ask for, now (BC-35).
import { defineMeasure } from '#kit'
import { claimsPending } from '../../measures'

export default defineMeasure({
  label: 'budgets.measures.claims-pending-value',
  unit: 'money',
  combine: 'level',
  by: [],
  ability: 'budgets.budget.view',
  read: query => claimsPending(query, 'money'),
})
