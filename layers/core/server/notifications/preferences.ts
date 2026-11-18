// A person's notification choices (FH-6): one switch per optional topic, for every topic on a side
// they have. A switch covers both channels, email and the inbox, so a topic switched off sends
// nothing at all; notify() reads the same rows and records the delivery as suppressed. A topic with
// no row is on. Transactional messages have no topic, so nothing here can stop them.
import { sql } from 'drizzle-orm'
import { all, refuse, usePoint } from '#kit'
import type { UnitView } from '#kit'
import { sidesOf } from './inbox'

export interface Topic { id: string, module: string, side: 'audience' | 'members', on: boolean }

interface TopicDecl { id: string, side: 'audience' | 'members', order?: number }

const CHANNELS = ['email', 'inbox'] as const

/** The optional topics of every module that is on, for the sides the person has, each with its switch. */
export async function topicsFor(accountId: string, member: boolean): Promise<Topic[]> {
  const sides = sidesOf(member)
  const declared = (await usePoint<TopicDecl>('core.notification-topic')).filter(t => sides.includes(t.value.side))
  if (!declared.length) return []
  const off = new Set((await all<{ topic_key: string }>(
    'SELECT DISTINCT topic_key FROM core_notification_preferences WHERE account_id = ? AND enabled = 0', // exact-account: a preference is moved to the survivor by the merge handler
    accountId,
  )).map(r => r.topic_key))
  return declared.map(t => ({ id: t.value.id, module: t.module, side: t.value.side, on: !off.has(t.value.id) }))
}

/** Switches a topic on or off on both channels. Refuses a topic the person cannot see as missing. */
export async function setTopic(unit: UnitView, accountId: string, member: boolean, topicId: string, on: boolean): Promise<void> {
  const topic = (await topicsFor(accountId, member)).find(t => t.id === topicId)
  if (!topic) refuse('core.notifications.unknown-topic', 'There is no such kind of message.', { status: 404 }) // not-policy: HTTP status
  for (const channel of CHANNELS) {
    unit.add(sql`INSERT INTO core_notification_preferences (account_id, topic_key, channel, side, enabled) VALUES (${accountId}, ${topic.id}, ${channel}, ${topic.side}, ${on ? 1 : 0})
      ON CONFLICT (account_id, topic_key, channel) DO UPDATE SET enabled = excluded.enabled, side = excluded.side`)
  }
}
