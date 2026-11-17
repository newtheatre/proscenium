// Daily: removes rota history, checklist runs and incident personal data past their periods.
import { defineTask } from '#kit'
import { sweep } from '../privacy'

export default defineTask(async (unit) => {
  await sweep(unit)
})
