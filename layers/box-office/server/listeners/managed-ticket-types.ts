// A module was switched on: make the ticket types it declares through box-office.ticket-type. When
// Box office itself is switched on, every module already on is covered at once.
import { defineListener } from '#kit'
import { ensureManagedTicketTypes } from '../ticket-types'

export default defineListener(async (_event, unit) => {
  await ensureManagedTicketTypes(unit)
})
