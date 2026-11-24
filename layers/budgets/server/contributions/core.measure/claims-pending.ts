// How many claims wait for a decision now (BC-35).
import { defineMeasure } from '#kit'
import { claimsPending } from '../../measures'

export default defineMeasure({
  label: 'budgets.measures.claims-pending',
  unit: 'count',
  combine: 'level',
  by: [],
  ability: 'budgets.budget.view',
  read: query => claimsPending(query, 'count'),
})
