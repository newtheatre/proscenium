// The panels the seller may use in the till, in order, each with the module that brings it and the
// components that draw it, in the console and in live mode.
import { defineRoute } from '#kit'
import { panelsFor } from '../../../till'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'default',
}, async (_event, { actor }) => ({
  panels: (await panelsFor(actor)).map(p => ({ id: p.id, module: p.module, label: p.value.label, tab: p.value.tab ?? p.value.label, icon: p.value.icon ?? null, panel: p.value.panel, livePanel: p.value.livePanel ?? null })),
}))
