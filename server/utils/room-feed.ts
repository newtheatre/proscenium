import { eq } from 'drizzle-orm'
import { calendarFor } from '#shared/utils/ics'
import type { CalendarEvent } from '#shared/utils/ics'
import type { Attachment } from '#server/utils/notify'
import type { H3Event } from 'h3'

// The personal calendar subscription (C-104). The URL is the credential, so it is hashed at rest
// and the plaintext exists only in the link the member copies.

async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// Replacing the row is what revokes the old URL: the hash it would be looked up by is gone, so
// nothing has to compare or expire anything (criterion 3).
export async function issueFeedToken(userId: string): Promise<string> {
  const plaintext = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')

  await db.batch([
    db.delete(schema.roomFeedTokens).where(eq(schema.roomFeedTokens.userId, userId)),
    db.insert(schema.roomFeedTokens).values({
      id: newId(),
      userId,
      tokenHash: await hashToken(plaintext),
    }),
  ])

  return plaintext
}

export interface FeedHolder { userId: string, name: string }

// Whose feed this is, or nothing. A token that names no live account is the same answer as one
// that never existed: the route cannot say which.
export async function feedHolder(plaintext: string): Promise<FeedHolder | undefined> {
  const [row] = await db.select({ userId: schema.roomFeedTokens.userId, name: schema.users.name })
    .from(schema.roomFeedTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.roomFeedTokens.userId))
    .where(eq(schema.roomFeedTokens.tokenHash, await hashToken(plaintext)))
    .limit(1)

  if (!row) return undefined

  await db.update(schema.roomFeedTokens)
    .set({ lastFetchedAt: Math.floor(Date.now() / 1000) })
    .where(eq(schema.roomFeedTokens.userId, row.userId))

  return row
}

export async function feedTokenExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.roomFeedTokens.id })
    .from(schema.roomFeedTokens)
    .where(eq(schema.roomFeedTokens.userId, userId))
    .limit(1)
  return row !== undefined
}

// One booking as an attachable calendar file, for whichever message carries it.
export function bookingAttachment(event: H3Event | undefined, booking: CalendarEvent): Attachment {
  const base = useRuntimeConfig(event).public.baseURL
  return {
    filename: 'booking.ics',
    contentType: 'text/calendar; charset=utf-8',
    content: calendarFor([booking], { name: booking.title, host: new URL(base).hostname }),
  }
}
