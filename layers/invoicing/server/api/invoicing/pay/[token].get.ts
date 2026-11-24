// The public invoice (S12), for whoever holds the link from its email: the frozen invoice, what is
// still owed and how to pay it. Nothing else about the party is shown.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { publicInvoice } from '../../../public'

export default defineRoute({ public: true, rateLimit: 'presented-value', tokens: ['token'] }, async (event) => {
  const view = await publicInvoice(getRouterParam(event, 'token') ?? '')
  if (!view) refuse('invoicing.link.not-found', 'This link does not open an invoice, or it has expired.', { status: 404, remedy: 'Ask the theatre to send it again.' })
  return view
})
