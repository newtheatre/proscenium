// What the viewer may do in the bar, for screens that hold several jobs: Stock's tabs in the console,
// and Outlets with the price lists in Admin. It gives nothing away but the viewer's own abilities.
import { can, defineRoute, type Actor } from '#kit'

// Held even where a fresh sign-in is still needed to use it: enough to be shown the way.
const HELD = ['core.access.not-fresh', 'core.access.needs-strong-sign-in']
async function may(actor: Actor, ability: Parameters<typeof can>[1]): Promise<boolean> {
  const decision = await can(actor, ability)
  return decision.allowed || HELD.includes(decision.code ?? '')
}

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({
  stock: { levels: await may(actor, 'bar.stock.view'), deliveries: await may(actor, 'bar.stock.receive'), counts: await may(actor, 'bar.stock.count') },
  setup: { outlets: await may(actor, 'bar.outlet.manage'), prices: await may(actor, 'bar.price.manage') },
}))
