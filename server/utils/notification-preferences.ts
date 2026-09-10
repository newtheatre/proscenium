import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { auditedWrite } from './audit'
import { configValue } from './configuration'
import { auditEntry } from '#shared/utils/audit'
import { NOTIFICATION_TOPICS } from '#shared/utils/notifications'
import type { Preference, PreferenceDefaults, PreferenceInput } from '#shared/utils/notifications'
import type { H3Event } from 'h3'

// One topic per row, one row per person: what the preference screen reads and writes, and what
// the notification centre honours at send time (H-102).

export async function preferenceDefaults(event?: H3Event): Promise<PreferenceDefaults> {
  return {
    email: await configValue(event, 'NOTIFICATION_EMAIL_DEFAULT_TOPICS'),
    push: await configValue(event, 'NOTIFICATION_PUSH_DEFAULT_TOPICS'),
  }
}

export async function storedPreferences(userId: string): Promise<Preference[]> {
  const rows = await db.select({
    topic: schema.notificationPreferences.topic,
    email: schema.notificationPreferences.email,
    push: schema.notificationPreferences.push,
  }).from(schema.notificationPreferences).where(eq(schema.notificationPreferences.userId, userId))

  return rows as Preference[]
}

export interface PreferenceCell {
  topic: string
  email: boolean
  push: boolean
  // Whether this row is the person's own choice or the configured default still standing.
  stored: boolean
  emailDefault: boolean
  pushDefault: boolean
}

// Every cell of the matrix, stored or not, so the screen shows a value for all of them
// (H-102 criterion 1).
export async function preferenceMatrix(event: H3Event | undefined, userId: string): Promise<PreferenceCell[]> {
  const defaults = await preferenceDefaults(event)
  const stored = await storedPreferences(userId)

  return NOTIFICATION_TOPICS.map((topic) => {
    const row = stored.find(candidate => candidate.topic === topic)
    const emailDefault = defaults.email.includes(topic)
    const pushDefault = defaults.push.includes(topic)
    return {
      topic,
      email: row ? row.email : emailDefault,
      push: row ? row.push : pushDefault,
      stored: Boolean(row),
      emailDefault,
      pushDefault,
    }
  })
}

// The person's own recent inbox entries. Written whatever their email preference says, so a
// message is still findable with email switched off (H-102 criterion 6).
export async function recentInbox(userId: string, limit = 20): Promise<{
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  createdAt: number
}[]> {
  return db.select({
    id: schema.inboxItems.id,
    type: schema.inboxItems.type,
    title: schema.inboxItems.title,
    body: schema.inboxItems.body,
    link: schema.inboxItems.link,
    createdAt: schema.inboxItems.createdAt,
  })
    .from(schema.inboxItems)
    .where(eq(schema.inboxItems.userId, userId))
    .orderBy(desc(schema.inboxItems.createdAt))
    .limit(limit)
}

// The trail carries the topic and the two switches, never a word about the person (0011).
export async function savePreference(userId: string, input: PreferenceInput): Promise<void> {
  const upsert = db.insert(schema.notificationPreferences)
    .values({ userId, topic: input.topic, email: input.email, push: input.push })
    .onConflictDoUpdate({
      target: [schema.notificationPreferences.userId, schema.notificationPreferences.topic],
      set: { email: input.email, push: input.push },
    })

  await auditedWrite(upsert, auditEntry({
    actorId: userId,
    action: 'notifications.preference.changed',
    target: `user:${userId}`,
    detail: { topic: input.topic, email: input.email, push: input.push },
  }))
}
