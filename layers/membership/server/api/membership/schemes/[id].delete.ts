// Deletes a draft that nobody has held (S1). After that a scheme is closed or archived, never deleted.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { hasMemberships, requireScheme } from '../../../schemes'

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (scheme.state !== 'draft' || await hasMemberships(scheme.id))
    refuse('membership.scheme.not-deletable', 'Only a draft that nobody has held can be deleted.', { status: 409, remedy: 'Close or archive the scheme instead.' })
  unit.add({ sql: 'DELETE FROM membership_length_options WHERE scheme_id = ?', params: [scheme.id] })
  unit.add({ sql: 'DELETE FROM membership_schemes WHERE id = ? AND state = \'draft\' AND NOT EXISTS (SELECT 1 FROM membership_memberships WHERE scheme_id = ?)', params: [scheme.id, scheme.id] })
    .expect(1, { code: 'membership.scheme.not-deletable', reason: 'Only a draft that nobody has held can be deleted.' })
  unit.audit({ action: 'delete', record: ['membership.scheme', scheme.id] })
  return { deleted: true }
})
