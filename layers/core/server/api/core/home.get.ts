// What a home page shows the person asking (UI-16): the cards they may see, most urgent first, with
// a card whose count is zero left out. When nothing is waiting the page offers common starting
// points, which are the quick actions they may use.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import { shows } from '../../interface/counts'
import { isMember } from '../../interface/viewer'

interface Card { id: string, home: string, ability: string | string[], component: string, urgency: 'overdue' | 'today' | 'info', count?: string }
interface Action { id: string, to: string, icon: string, ability: string | string[], keywords?: string }

const RANK = { overdue: 0, today: 1, info: 2 } as const
const MOST_STARTERS = 3 // not-policy: a short list of starting points

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ home: z.enum(['console', 'members', 'tonight', 'admin']).default('console') }),
}, async (_event, { input, actor }) => {
  if (input.home === 'members' && !(await isMember(actor))) return { cards: [], starters: [] }
  const cards: { id: string, component: string, urgency: Card['urgency'], count?: number }[] = []
  for (const { value } of await usePoint<Card>('core.home-card')) {
    if (value.home !== input.home || !holds(await mayOpen(actor, { ability: value.ability }))) continue
    const { show, value: count } = await shows({ count: value.count, hideEmpty: true }, actor)
    if (show) cards.push({ id: value.id, component: value.component, urgency: value.urgency, count })
  }
  // Array.sort is stable, so cards of one urgency keep the order modules declared them in.
  cards.sort((a, b) => RANK[a.urgency] - RANK[b.urgency])
  const starters: { id: string, to: string, icon: string, labelKey: string }[] = []
  if (!cards.length) {
    for (const { module, value } of await usePoint<Action>('core.quick-action')) {
      if (starters.length >= MOST_STARTERS) break
      if (!holds(await mayOpen(actor, { ability: value.ability }))) continue
      starters.push({ id: value.id, to: value.to, icon: value.icon, labelKey: `${module}.quick-actions.${value.id.slice(value.id.indexOf('.') + 1)}.label` })
    }
  }
  return { cards, starters }
})
