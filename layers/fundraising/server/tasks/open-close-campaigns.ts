// Opens published campaigns whose time has come and closes those past their end (FR-10).
import { defineTask } from '#kit'
import { openAndCloseDue } from '../campaigns'

export default defineTask(async (unit) => {
  await openAndCloseDue(unit)
})
