// The person's inbox on one side (C-30): newest first, current or archived, a page at a time, with
// the unread count. Nothing of the members' side is shown to someone who is not a member.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { isMember } from '../../../interface/viewer'
import { listInbox } from '../../../notifications/inbox'

const PAGE = 25 // not-policy: one screenful of messages

const inboxSide = z.enum(['audience', 'members']).default('audience')

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ side: inboxSide, archived: z.enum(['0', '1']).default('0'), before: z.string().max(40).optional() }), // not-policy: an id's bound
}, async (_event, { input, actor }) => {
  if (input.side === 'members' && !(await isMember(actor))) refuse('core.not-found', 'There is nothing here.', { status: 404 }) // not-policy: HTTP status
  return listInbox(actor.accountId!, input.side, { archived: input.archived === '1', before: input.before, size: PAGE })
})
