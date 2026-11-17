// "Apply for someone" (ID-42): a name and an address; the account is found or made, and the
// reviewer is taken to the form to fill in with them. Nothing is sent until the form is.
import { accessPersonInput } from '../../../../shared/access-scheme'
import { defineRoute } from '#kit'
import { personToApplyFor } from '../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.review',
  rateLimit: 'write',
  input: accessPersonInput,
}, async (_event, { input, unit, actor }) => personToApplyFor(unit, actor, input))
