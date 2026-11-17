// Invite somebody to apply (ID-42): a name and an address; the account is found or made, and the
// person is emailed a single-use link that signs them in and opens the form.
import { accessPersonInput } from '../../../../shared/access-scheme'
import { defineRoute } from '#kit'
import { inviteToApply } from '../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.review',
  rateLimit: 'write',
  input: accessPersonInput,
}, async (event, { input, unit, actor }) => inviteToApply(unit, event, actor, input))
