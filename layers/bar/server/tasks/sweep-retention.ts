// Daily: erases descriptions of people refused once their register rows pass the retention period.
import { defineTask } from '#kit'
import { sweep } from '../age-checks'

export default defineTask(async (unit) => {
  await sweep(unit)
})
