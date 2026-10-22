import { sql } from 'drizzle-orm'
import { MESSAGE_TYPES } from '#shared/utils/notifications'
import type { NotificationTopic } from '#shared/utils/senders'
import type { SQL } from 'drizzle-orm'

// What a held digest entry carries beside its subject, kept as JSON in `body` so no column is
// added (0206). A row written before that, or one erasure scrubbed, is plain text and still reads.

export interface HeldLink { url: string, says: string }

export interface Held {
  text: string
  line: string
  link: HeldLink | null
  about: string[]
}

// The one link a digest line leads to: the queue for an approver, their bookings for a member.
function linkFrom(context: Record<string, unknown>): HeldLink | null {
  if (typeof context.queueUrl === 'string') return { url: context.queueUrl, says: 'Open the queue' }
  if (typeof context.roomsUrl === 'string') return { url: context.roomsUrl, says: 'See your bookings' }
  return null
}

export function heldBody(rendered: { subject: string, text: string, line?: string }, context: Record<string, unknown>, about: string[]): string {
  const line = (rendered.line ?? rendered.subject).replace(/\s+/g, ' ').trim()
  return JSON.stringify({ text: rendered.text, line, link: linkFrom(context), about } satisfies Held)
}

export function readHeld(subject: string, body: string): Held {
  let parsed: Partial<Held> | null
  try {
    parsed = JSON.parse(body) as Partial<Held> | null
  }
  catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string') {
    return { text: body, line: subject, link: null, about: [] }
  }
  return {
    text: parsed.text,
    line: typeof parsed.line === 'string' && parsed.line ? parsed.line : subject,
    link: parsed.link && typeof parsed.link.url === 'string' && typeof parsed.link.says === 'string' ? parsed.link : null,
    about: Array.isArray(parsed.about) ? parsed.about.filter(id => typeof id === 'string') : [],
  }
}

const DECIDING = Object.entries(MESSAGE_TYPES).filter(([, type]) => 'decides' in type).map(([name]) => name)

// Every unclaimed entry about any of these records, for anybody, but one of the same type: that is
// this same decision told to another approver. The ids are one JSON parameter (0006, 0206).
export function supersedeStatement(topic: NotificationTopic, type: string, about: string[]): SQL {
  return sql`
    DELETE FROM notification_digest_entries
    WHERE topic = ${topic} AND digest_log_id IS NULL AND type <> ${type}
      AND CASE WHEN json_valid(body) THEN EXISTS (
        SELECT 1 FROM json_each(notification_digest_entries.body, '$.about') AS held
        JOIN json_each(${JSON.stringify(about)}) AS decided ON decided.value = held.value
      ) ELSE 0 END
  `
}

export interface ClaimedEntry { subject: string, body: string, type: string, createdAt: number }

function decides(type: string): boolean {
  return DECIDING.includes(type)
}

// Decisions lead, because they are what changed for the reader; within each, oldest first.
export function inDigestOrder<T extends { type: string, createdAt: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => Number(decides(b.type)) - Number(decides(a.type)) || a.createdAt - b.createdAt)
}
