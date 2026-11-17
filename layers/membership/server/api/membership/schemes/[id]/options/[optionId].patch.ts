// Renames, reorders, withdraws or offers again a length. A withdrawn length takes no new joiners and
// is never deleted once a membership names it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { requireScheme } from '../../../../../schemes'

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    name: z.string().trim().min(1).max(40).optional(), // not-policy: the specification's bound
    state: z.enum(['offered', 'withdrawn']).optional(),
    position: z.number().int().min(0).optional(),
  }),
}, async (event, { input, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  const optionId = getRouterParam(event, 'optionId')
  const option = await first<{ name: string, state: string, position: number }>('SELECT name, state, position FROM membership_length_options WHERE id = ? AND scheme_id = ?', optionId, scheme.id)
  if (!option) refuse('core.not-found', 'There is no such length on this scheme.', { status: 404 })
  unit.add({
    sql: 'UPDATE membership_length_options SET name = ?, state = ?, position = ? WHERE id = ?',
    params: [input.name ?? option!.name, input.state ?? option!.state, input.position ?? option!.position, optionId],
  }).expect(1)
  unit.audit({ action: 'update', record: ['membership.scheme', scheme.id], detail: { option: optionId!, state: input.state ?? null } })
  return { optionId }
})
