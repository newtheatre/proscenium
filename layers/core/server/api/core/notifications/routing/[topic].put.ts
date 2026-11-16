// Chooses the sender a topic's mail comes from; null goes back to the default (C-32).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse, usePoint } from '#kit'

export default defineRoute({
  ability: 'core.sender.manage',
  rateLimit: 'write',
  input: z.object({ sender: z.string().nullable() }),
}, async (event, { input, unit }) => {
  const topic = getRouterParam(event, 'topic') ?? ''
  const topics = ['transactional', ...(await usePoint<{ id: string }>('core.notification-topic')).map(t => t.value.id)]
  if (!topics.includes(topic)) refuse('core.notifications.unknown-topic', `There is no topic called ${topic}.`, { status: 404 })
  if (input.sender === null) {
    unit.add({ sql: 'DELETE FROM core_notification_routing WHERE topic_key = ?', params: [topic] })
  }
  else {
    const sender = await first("SELECT key FROM core_sender_identities WHERE key = ? AND state = 'active'", input.sender)
    if (!sender) refuse('core.senders.unknown', `There is no active sender called ${input.sender}.`, { status: 422, fields: { sender: 'unknown' } })
    unit.add({ sql: 'INSERT INTO core_notification_routing (topic_key, sender_key) VALUES (?, ?) ON CONFLICT (topic_key) DO UPDATE SET sender_key = excluded.sender_key', params: [topic, input.sender] })
  }
  unit.audit({ action: 'update', record: ['core.sender', input.sender ?? 'default'], detail: { topic } })
  return { topic, sender: input.sender }
})
