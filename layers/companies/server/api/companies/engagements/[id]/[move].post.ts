// Part 3's moves table: confirms or cancels the engagement, guarded on the state that was read (CO-02).
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { MOVES } from '../../../../../shared/companies'
import type { Move } from '../../../../../shared/companies'
import { moveEngagement, moveInput, requireEngagement } from '../../../../engagements'

export default defineRoute({
  ability: 'companies.engagement.manage',
  record: event => ['companies.engagement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: moveInput,
}, async (event, { input, actor, record, unit }) => {
  const move = getRouterParam(event, 'move') ?? ''
  if (!Object.hasOwn(MOVES, move)) refuse('core.not-found', 'There is no such move.', { status: 404 })
  await moveEngagement(unit, actor, await requireEngagement(record!.id), { ...input, move: move as Move })
  return { moved: move }
})
