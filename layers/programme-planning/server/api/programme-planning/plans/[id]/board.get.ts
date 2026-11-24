// PP-03: the board's one read. Spaces across, up to fourteen operating days, every space's time from
// the occupancy service with this plan's placements marked, and the plan's version (P8).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { boardDays, boardItems, boardSpaces, chunkAround } from '../../../../board'
import { requirePlan } from '../../../../plans'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of a date

export default defineRoute({
  ability: 'programme-planning.plan.view',
  record: event => ['programme-planning.plan', getRouterParam(event, 'id')],
  rateLimit: 'default',
  // `day` asks for the fourteen-day stretch holding it; `from` and `to` for any window up to fourteen days.
  input: z.object({ day: date.optional(), from: date.optional(), to: date.optional() }),
}, async (_event, { input, record, actor }) => {
  const plan = await requirePlan(record!.id)
  const chunk = input.day || !input.from ? chunkAround(plan, input.day ?? plan.boardFrom) : null
  const from = chunk?.from ?? input.from!
  const days = await boardDays(plan, from, chunk?.to ?? input.to ?? from)
  const spaces = await boardSpaces()
  return {
    plan: { id: plan.id, version: plan.version, state: plan.state, boardFrom: plan.boardFrom, boardTo: plan.boardTo },
    days,
    before: chunk?.before ?? null,
    after: chunk?.after ?? null,
    spaces,
    occupancy: await boardItems(plan, spaces, days, actor),
  }
})
