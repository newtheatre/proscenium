// The bell's number: unread messages on each side the person has, and in all, which is what the
// bell, the menus and every other count of the inbox show (AC-2). Answers a visitor too, with no
// bell, so the shells ask without first waiting to learn who is looking. The members' side is
// nought for someone who is not a member.
import { defineRoute } from '#kit'
import { isMember } from '../../../../interface/viewer'
import { unreadCount } from '../../../../notifications/inbox'

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => {
  if (actor.kind !== 'person' || !actor.accountId) return { signedIn: false, audience: 0, members: 0, total: 0 }
  const audience = await unreadCount(actor.accountId, 'audience')
  const members = await isMember(actor) ? await unreadCount(actor.accountId, 'members') : 0
  return { signedIn: true, audience, members, total: audience + members }
})
