// Issue a passkey enrolment link for somebody locked out (ID-08). It works once, within
// core.recovery.enrolment-link-lifetime, and is shown here once for the member of staff to hand over.
// Nobody can issue one for themselves: the guard refuses a privileged ability on your own record.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { issueEnrolmentLink } from '../../../../identity/recovery'

export default defineRoute({
  ability: 'core.account.recover',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { record, unit, actor }) => issueEnrolmentLink(unit, event, actor, record!.id))
