// The ticket types, for the Ticket types screen and for setting prices. Types a module declares are
// made or brought up to date first, so a module switched on before this was built still has them.
// Carries the requirements on offer, for the picker, and the labels of those in use.
import { defineRoute, requirements, usePoint } from '#kit'
import { ensureManagedTicketTypes, listTicketTypes } from '../../../ticket-types'

export default defineRoute({ ability: 'box-office.pricing.manage', rateLimit: 'default' }, async () => {
  await ensureManagedTicketTypes()
  const ticketTypes = await listTicketTypes()
  const sources = (await usePoint('core.requirement')).map(c => c.id)
  const offered = (await Promise.all(sources.map(id => requirements.options(id, '')))).flat()
  const inUse = [...new Set(ticketTypes.flatMap(t => t.requirementRefs))]
  const described = await requirements.describe(inUse)
  const labels: Record<string, string> = Object.fromEntries(offered.map(o => [o.reference, o.label]))
  for (const [ref, d] of Object.entries(described)) labels[ref] = d.label
  return { ticketTypes, requirementOptions: offered.map(o => ({ value: o.reference, label: o.label })), requirementLabels: labels }
})
