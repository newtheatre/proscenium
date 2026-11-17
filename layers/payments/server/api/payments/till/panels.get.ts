// The panels the seller may use in the till, in order, each with the component that draws it.
import { defineRoute } from '#kit'
import { panelsFor } from '../../../till'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
}, async (_event, { actor }) => ({
  panels: (await panelsFor(actor)).map(p => ({ id: p.id, label: p.value.label, panel: p.value.panel })),
}))
