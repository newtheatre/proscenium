// A module was switched on: make the ticket types it declares through box-office.ticket-type. When
// Box office itself is switched on, every module already on is covered at once, and a theatre with
// no tickets of its own is given Full price, Concession and a "Usual tickets" preset (decision 8).
import { defineListener } from '#kit'
import { ensureManagedTicketTypes } from '../ticket-types'
import { seedTickets } from '../ticket-presets'

export default defineListener(async (event, unit) => {
  await ensureManagedTicketTypes(unit)
  if ((event.payload as { moduleId?: string }).moduleId === 'box-office') await seedTickets(unit)
})
