// A new request tells the people who may decide it (rule A5), once it is saved.
import { defineListener } from '#kit'
import { tellApprovers } from '../decisions'

export default defineListener(async (event, unit) => {
  await tellApprovers(unit, event.payload.bookingId as string)
})
