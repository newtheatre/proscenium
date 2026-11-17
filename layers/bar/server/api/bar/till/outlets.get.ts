// The outlets a seller may sell from in the till's bar panel, the desk outlet first.
import { can, defineRoute } from '#kit'
import { outlets } from '../../../catalogue'

export default defineRoute({ ability: 'bar.sale.sell', rateLimit: 'default' }, async (_event, { actor }) => {
  const mine = []
  for (const o of (await outlets()).filter(o => o.active)) {
    if ((await can(actor, 'bar.sale.sell', ['bar.outlet', o.id])).allowed) mine.push({ id: o.id, name: o.name, kind: o.kind })
  }
  return { outlets: mine.sort((a, b) => Number(b.kind === 'desk') - Number(a.kind === 'desk')) }
})
