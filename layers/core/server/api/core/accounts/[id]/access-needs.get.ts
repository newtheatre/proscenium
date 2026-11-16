// Read a person's access needs for a purpose (ID-39): the welfare lead's, or any a module declares
// whose reader works in the console. accessNeedsFor answers only for an accepted application, a
// purpose switched on and an actor holding its ability, and the same way whichever test failed.
import { getRouterParam, getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accessNeedsFor } from '../../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-profile.read',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (event, { record, unit, actor }) => {
  const purpose = String(getQuery(event).purpose ?? 'core.welfare').slice(0, 80) // not-policy: a purpose id is short
  const needs = await accessNeedsFor(unit, actor, record!.id, purpose)
  return needs ? { shared: true, ...needs } : { shared: false }
})
