// The person's inbox (C-30, AC-2): newest first, current or archived, a page at a time, with the
// unread count. One inbox holds every side the person has; `side` narrows it to the audience side
// or the members' side. Nothing of the members' side is shown to someone who is not a member.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { isMember } from '../../../interface/viewer'
import { listInbox, sidesOf } from '../../../notifications/inbox'

const PAGE = 25 // not-policy: one screenful of messages

const inboxSide = z.enum(['all', 'audience', 'members']).default('audience')

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ side: inboxSide, archived: z.enum(['0', '1']).default('0'), before: z.string().max(40).optional() }), // not-policy: an id's bound
}, async (_event, { input, actor }) => {
  const member = await isMember(actor)
  if (input.side === 'members' && !member) refuse('core.not-found', 'There is nothing here.', { status: 404 }) // not-policy: HTTP status
  return listInbox(actor.accountId!, input.side === 'all' ? sidesOf(member) : input.side, { archived: input.archived === '1', before: input.before, size: PAGE })
})
