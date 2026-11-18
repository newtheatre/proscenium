// The till (Box office specification, part 4, "One payment with several owners"): Payments' desk
// component. Each module with something to sell at the desk contributes a panel to
// payments.desk-basket; the till asks each panel the seller filled in to prepare its part, in the one
// batch that creates the intent, and then takes one payment for the total.
import { can, nowMs, Refusal, runInContext, useContext, usePoint, type Actor, type UnitView } from '#kit'
import { createIntent } from './intents'
import type { DeskBasket, SummaryLine } from './points/desk-basket'
import { addSplits, planSplits, wholeSale, type SplitInput, type SplitPanel } from './splits'
import type { Destination } from './points/settlement'

/** How long a desk sale may wait unpaid before the expiry task releases it. */
const DESK_INTENT_LIFETIME = 30 * 60_000 // not-policy: a backstop for a till left mid-sale; the seller cancels or takes payment long before

export interface PanelInput { basket: string, input: unknown }

/**
 * A panel's code is its owner's, so each of its functions runs as its owner: the request is Payments',
 * but what a panel signs or reads under its module's name is its own to use. The unit still commits
 * in Payments' context.
 */
function asOwner(module: string, basket: DeskBasket): DeskBasket {
  const wrapped = Object.entries(basket).map(([name, member]) => [
    name,
    typeof member === 'function' ? (...args: unknown[]) => runInContext({ ...useContext(), module }, () => member.apply(basket, args)) : member,
  ])
  return Object.fromEntries(wrapped) as DeskBasket
}

/** The panels the seller may use, in order. */
export async function panelsFor(actor: Actor): Promise<{ id: string, module: string, value: DeskBasket }[]> {
  const out = []
  for (const c of await usePoint<DeskBasket>('payments.desk-basket')) {
    if ((await can(actor, c.value.ability as any)).allowed) out.push({ ...c, value: asOwner(c.module, c.value) })
  }
  return out.sort((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0))
}

async function chosen(actor: Actor, panels: PanelInput[]) {
  const mine = new Map((await panelsFor(actor)).map(p => [p.id, p]))
  const seen = new Set<string>()
  return panels.map((p) => {
    const panel = mine.get(p.basket)
    if (!panel) throw new Refusal('payments.till.no-panel', 'That is not something you can sell here.', { status: 403 })
    if (seen.has(p.basket)) throw new Refusal('payments.till.panel-twice', 'Each panel is sent once.', { status: 422 })
    seen.add(p.basket)
    return { panel, input: p.input }
  })
}

/** Where the filled panels say the sale happens: the first that names a space, else null. Reads only. */
export async function tillSpace(actor: Actor, panels: PanelInput[]): Promise<string | null> {
  for (const { panel, input } of await chosen(actor, panels)) {
    const space = await panel.value.space?.({ input }).catch(() => null)
    if (space) return space
  }
  return null
}

/** What the filled panels add up to, for display. Reads only. */
export async function tillSummary(actor: Actor, panels: PanelInput[]) {
  const out = []
  for (const { panel, input } of await chosen(actor, panels)) out.push({ basket: panel.id, ...await panel.value.summary({ input }) })
  return { panels: out, amountMinor: out.reduce((s, p) => s + p.amountMinor, 0) }
}

/**
 * Prepares every filled panel and opens one intent for them in the session, in the caller's unit.
 * With `splits`, the sale is split between people by item: each panel's summary lines are given out
 * as the till says, and must add up to what the panel prepared. A panel that can narrow its input
 * (Box office) prepares a record for each person who has some of its lines, so each person's
 * tickets are a booking of their own; any other panel's one record is shared between them.
 */
export async function prepareSale(unit: UnitView, actor: Actor, sessionId: string, panels: PanelInput[], splits?: SplitInput[], receipt?: Destination): Promise<{ intentId: string, amountMinor: number }> {
  if (splits && receipt) throw new Refusal('payments.till.receipt-per-person', 'A split sale has a receipt for each person, given as they pay.', { status: 422 })
  if (!panels.length) throw new Refusal('payments.till.empty', 'There is nothing to take payment for.', { status: 422 })
  // What the receipt lists, read before anything is prepared.
  type Chosen = Awaited<ReturnType<typeof chosen>>[number]
  type Part = Awaited<ReturnType<DeskBasket['prepare']>>
  const filled: (Chosen & { lines: SummaryLine[] })[] = []
  for (const { panel, input } of await chosen(actor, panels)) filled.push({ panel, input, lines: (await panel.value.summary({ input })).lines })
  const lined: SplitPanel[] = filled.map(f => ({ basket: f.panel.id, owner: { module: f.panel.module, record: '' }, lines: f.lines }))
  const planned = splits ? planSplits(lined, splits) : null

  const parts: Part[] = []
  const prepared: { panel: Chosen['panel'], part: Part }[] = []
  const make = async (panel: Chosen['panel'], input: unknown) => {
    const part = await panel.value.prepare(unit, { sessionId, input })
    if (part.owner.module !== panel.module) throw new Error(`${panel.module}'s panel prepared a part for ${part.owner.module}`)
    parts.push(part)
    prepared.push({ panel, part })
    return part
  }
  for (const f of filled) {
    const people = (planned ?? []).map(p => ({ p, mine: p.items.filter(i => i.basket === f.panel.id) })).filter(x => x.mine.length)
    const narrowed = people.length > 1 && f.panel.value.narrow
      ? await Promise.all(people.map(x => f.panel.value.narrow!(f.input, x.mine.map(i => ({ line: i.line, quantity: i.quantity })))))
      : null
    if (narrowed && narrowed.every(n => n !== null && n !== undefined)) {
      for (const [k, x] of people.entries()) {
        const part = await make(f.panel, narrowed[k])
        if (part.amountMinor !== x.mine.reduce((sum, i) => sum + i.amountMinor, 0))
          throw new Refusal('payments.till.split-changes-price', 'Splitting these changes what they cost, such as an offer that applies once to each booking.', { status: 409, remedy: 'Take them together, or give them to people another way.' })
        for (const i of x.mine) i.record = part.owner.record
      }
      continue
    }
    const part = await make(f.panel, f.input)
    if (planned && f.lines.reduce((sum, l) => sum + l.amountMinor, 0) !== part.amountMinor)
      throw new Refusal('payments.till.total-changed', 'The items on the receipt no longer add up to the total.', { status: 409, remedy: 'Check the receipt, then split it again.' })
    for (const p of planned ?? []) for (const i of p.items) if (i.basket === f.panel.id) i.record = part.owner.record
    lined.find(l => l.basket === f.panel.id)!.owner = part.owner
  }
  const rows = planned ?? [{ ...wholeSale(lined), amountMinor: parts.reduce((s, p) => s + p.amountMinor, 0) }]
  const { intentId } = await createIntent(unit, { parts, channel: 'desk', sessionId, expiresAt: nowMs() + DESK_INTENT_LIFETIME })
  for (const { panel, part } of prepared) await panel.value.attach?.(unit, part.owner.record, intentId)
  addSplits(unit, intentId, rows, receipt)
  return { intentId, amountMinor: parts.reduce((s, p) => s + p.amountMinor, 0) }
}
