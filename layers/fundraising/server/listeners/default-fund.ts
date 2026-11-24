// Fundraising was switched on: the general fund and its donations account (FR-01). Safe to repeat.
import { defineListener } from '#kit'
import { ensureDefaultFund } from '../funds'

export default defineListener(async (event, unit) => {
  if (event.payload.moduleId === 'fundraising') await ensureDefaultFund(unit)
})
