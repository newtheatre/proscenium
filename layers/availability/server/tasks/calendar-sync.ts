// Every quarter hour: queue the refreshes that are due, and drop a week-broken connection's blocks (I5).
import { defineTask } from '#kit'
import { syncCalendars } from '../calendars'

export default defineTask(async (unit) => {
  await syncCalendars(unit)
})
