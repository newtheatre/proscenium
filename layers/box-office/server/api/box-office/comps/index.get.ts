// Complimentary tickets (Box office specification, part 6, "Complimentary tickets"): the requests
// this person has made, the requests waiting that they may decide, and the performances they may
// ask for, each with its bands. Anyone signed in may open it; what it holds depends on their grants.
import { sql } from 'drizzle-orm'
import { can, defineRoute, inAccountScope, nowMs, useSetting } from '#kit'
import { accountLabel, getPerformance, getProduction, getTerm, listPerformances } from '#modules/core'
import { compsWhere, type CompRow } from '../../../comps'
import { poolsOf } from '../../../setup'

const MOST = 200 // not-policy: how many performances the form offers at once
const DAY = 86_400_000 // not-policy: performances that started earlier today stay listed

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const titles = new Map<string, string>()
  const titleOf = async (productionId: string) => {
    if (!titles.has(productionId)) titles.set(productionId, (await getProduction(productionId)).title)
    return titles.get(productionId)!
  }
  const bandNames = new Map<string, string>()
  const view = async (r: CompRow) => {
    const performance = await getPerformance(r.performance_id)
    if (!bandNames.has(r.band_id)) for (const p of await poolsOf(r.performance_id)) bandNames.set(p.bandId, p.bandName)
    return {
      id: r.id, state: r.state, quantity: r.quantity, createdAt: r.created_at, decidedAt: r.decided_at, orderId: r.order_id,
      show: await titleOf(performance.productionId), startsAt: performance.startsAt, band: bandNames.get(r.band_id) ?? '',
      forName: await accountLabel(r.for_account_id), reason: (await getTerm(r.reason_term_id))?.label ?? '',
      requestedBy: await accountLabel(r.requested_by),
    }
  }

  const mine = await Promise.all((await compsWhere(inAccountScope('requested_by', actor.accountId!))).map(view))
  const open = []
  // The ability refuses the requester, so their own requests never show as waiting for them.
  for (const r of await compsWhere(sql`state = 'requested'`)) {
    if ((await can(actor, 'box-office.comp.approve', ['box-office.comp-request', r.id])).allowed) open.push(await view(r))
  }

  const performances = []
  for (const p of (await listPerformances({ from: nowMs() - DAY })).filter(x => x.state !== 'cancelled').slice(0, MOST)) {
    if (!(await can(actor, 'box-office.comp.request', ['core.performance', p.id])).allowed) continue
    const bands = (await poolsOf(p.id)).map(b => ({ id: b.bandId, name: b.bandName }))
    if (bands.length) performances.push({ id: p.id, title: await titleOf(p.productionId), label: p.label, startsAt: p.startsAt, bands })
  }
  return { mine, waiting: open, performances, needsApproval: await useSetting('box-office.comps.needs-approval') as boolean }
})
