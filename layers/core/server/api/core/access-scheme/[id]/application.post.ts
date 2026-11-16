// Apply on somebody's behalf, by phone or in person (ID-42). The application is marked as made by
// staff; the person is emailed and can correct it from their account.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { apply, applicationInput } from '../../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.review',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: applicationInput,
}, async (_event, { input, record, unit, actor }) => apply(unit, actor, record!.id, input))
