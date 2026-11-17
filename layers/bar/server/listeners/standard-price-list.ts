// A module was switched on: when it is the bar, make its Standard price list. Safe to repeat.
import { defineListener } from '#kit'
import { ensureStandard } from '../catalogue'

export default defineListener(async (event, unit) => {
  if (event.payload.moduleId === 'bar') ensureStandard(unit)
})
