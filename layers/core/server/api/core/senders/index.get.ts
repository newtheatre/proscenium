// The sender identities and which topic uses which (C-32).
import { all, defineRoute, usePoint } from '#kit'

export default defineRoute({ ability: 'core.sender.manage', rateLimit: 'default' }, async () => {
  const senders = await all('SELECT key, display_name AS displayName, local_part AS localPart, reply_to AS replyTo, state FROM core_sender_identities ORDER BY key')
  const routing = await all('SELECT topic_key AS topic, sender_key AS sender FROM core_notification_routing ORDER BY topic_key')
  const topics = ['transactional', ...(await usePoint<{ id: string }>('core.notification-topic')).map(t => t.value.id)]
  return { senders, routing, topics }
})
