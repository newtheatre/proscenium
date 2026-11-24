// Budgets was switched on: seed the preset categories (BC-03). Finance makes the accounts it declares.
import { defineListener } from '#kit'
import { seedCategories } from '../categories'

export default defineListener(async (event, unit) => {
  if (event.payload.moduleId === 'budgets') seedCategories(unit)
})
