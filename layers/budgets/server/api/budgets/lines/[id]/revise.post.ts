// Revises an approved line with a reason (BC-09). Below what it has spent and committed, the treasurer confirms.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireLine } from '../../../../budgets'
import { revise } from '../../../../changes'

const input = z.object({
  amountMinor: z.number().int().min(0).max(100_000_000), // not-policy: a million pounds, a sanity bound
  reason: z.string().trim().min(1).max(200), // not-policy: the table's bound
  confirm: z.boolean().optional(),
})

export default defineRoute({ ability: 'budgets.budget.approve', rateLimit: 'write', input }, async (event, { input, unit, actor }) => {
  const { budget, line } = await requireLine(getRouterParam(event, 'id'))
  if (line.archivedAt) refuse('budgets.line.archived', 'This line is archived.', { status: 409, remedy: 'Restore it first.' })
  await revise(unit, budget, { lineId: line.id, amountMinor: input.amountMinor, reason: input.reason, confirm: input.confirm, by: actor.accountId! })
  return { lineId: line.id }
})
