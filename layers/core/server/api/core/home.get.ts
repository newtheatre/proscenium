// What a home page shows the person asking (UI-16): the cards they may see, most urgent first, with
// a card whose count is zero left out. The console home adds the quick actions and headline figures
// the person may use and see; the other homes offer quick actions as starting points when nothing waits.
import { z } from 'zod'
import { defineRoute, usePoint, type Actor } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import { shows } from '../../interface/counts'
import { isMember } from '../../interface/viewer'
import type { FigureAnswer, HomeFigure } from '../../points/home-figure'

interface Card { id: string, home: string, ability: string | string[], component: string, urgency: 'overdue' | 'today' | 'info', count?: string }
interface Action { id: string, to: string, icon: string, ability: string | string[], keywords?: string }
type Starter = { id: string, to: string, icon: string, labelKey: string }
export type ShownFigure = { id: string, label: string, size: NonNullable<HomeFigure['size']>, to?: string } & FigureAnswer

const RANK = { overdue: 0, today: 1, info: 2 } as const
const MOST_STARTERS = 3 // not-policy: a short list of starting points
const MOST_ACTIONS = 6 // not-policy: one row of buttons on a laptop
const FIGURE_BUDGET = 2000 // not-policy: how long the home waits for one figure

async function actionsFor(actor: Actor, most: number): Promise<Starter[]> {
  const out: Starter[] = []
  for (const { module, value } of await usePoint<Action>('core.quick-action')) {
    if (out.length >= most) break
    if (!holds(await mayOpen(actor, { ability: value.ability }))) continue
    out.push({ id: value.id, to: value.to, icon: value.icon, labelKey: `${module}.quick-actions.${value.id.slice(value.id.indexOf('.') + 1)}.label` })
  }
  return out
}

async function readFigure(figure: HomeFigure, actor: Actor): Promise<FigureAnswer | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), FIGURE_BUDGET)
    })
    return await Promise.race([Promise.resolve(figure.read(actor)), late])
  }
  catch (error) {
    console.error('[home] a figure failed', error)
    return null
  }
  finally {
    clearTimeout(timer)
  }
}

async function figuresFor(actor: Actor): Promise<ShownFigure[]> {
  const contributions = []
  for (const c of await usePoint<HomeFigure>('core.home-figure')) {
    if (holds(await mayOpen(actor, { ability: c.value.ability }))) contributions.push(c)
  }
  const answers = await Promise.all(contributions.map(c => readFigure(c.value, actor)))
  return contributions.flatMap((c, i) => {
    const answer = answers[i]
    if (!answer) return []
    return [{ id: c.id, label: c.value.label, size: c.value.size ?? 'small', ...c.value.to ? { to: c.value.to } : {}, ...answer }]
  })
}

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ home: z.enum(['console', 'members', 'tonight', 'admin']).default('console') }),
}, async (_event, { input, actor }) => {
  if (input.home === 'members' && !(await isMember(actor))) return { cards: [], starters: [], actions: [], figures: [] }
  const cards: { id: string, component: string, urgency: Card['urgency'], count?: number }[] = []
  for (const { value } of await usePoint<Card>('core.home-card')) {
    if (value.home !== input.home || !holds(await mayOpen(actor, { ability: value.ability }))) continue
    const { show, value: count } = await shows({ count: value.count, hideEmpty: true }, actor)
    if (show) cards.push({ id: value.id, component: value.component, urgency: value.urgency, count })
  }
  // Array.sort is stable, so cards of one urgency keep the order modules declared them in.
  cards.sort((a, b) => RANK[a.urgency] - RANK[b.urgency])
  if (input.home === 'console') {
    const [actions, figures] = await Promise.all([actionsFor(actor, MOST_ACTIONS), figuresFor(actor)])
    return { cards, starters: [], actions, figures }
  }
  return { cards, starters: cards.length ? [] : await actionsFor(actor, MOST_STARTERS), actions: [], figures: [] }
})
