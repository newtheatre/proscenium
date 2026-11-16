// Open one application (ID-40). The ability is declared audit: 'read', so every opening is recorded,
// and nobody opens their own.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { openForReview } from '../../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.read',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  return { application: (await openForReview(record!.id)) ?? refuse('core.not-found', 'There is no application.', { status: 404 }) }
})
