// Adds a length a scheme can be held for (MEM-56): "1 year", "3 years". Counted in scheme years for
// a fixed scheme and months for a rolling one; an indefinite scheme has none.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { requireScheme } from '../../../../../schemes'

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    name: z.string().trim().min(1).max(40), // not-policy: the specification's bound
    count: z.number().int().min(1).max(120), // not-policy: the specification's bound
  }),
}, async (_event, { input, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (scheme.lengthRule === 'indefinite') refuse('membership.option.indefinite', 'An indefinite scheme has no lengths: it lasts until somebody ends it.', { status: 409 })
  const id = newId('mlo')
  unit.add({
    sql: `INSERT OR IGNORE INTO membership_length_options (id, scheme_id, name, count, state, position, created_at)
          VALUES (?, ?, ?, ?, 'offered', (SELECT coalesce(max(position), 0) + 1 FROM membership_length_options WHERE scheme_id = ?), ?)`,
    params: [id, scheme.id, input.name, input.count, scheme.id, nowMs()],
  }).expect(1, { code: 'membership.option.taken', reason: 'This scheme already has a length of that many.' })
  unit.audit({ action: 'update', record: ['membership.scheme', scheme.id], detail: { option: 'added', count: input.count } })
  return { optionId: id }
})
