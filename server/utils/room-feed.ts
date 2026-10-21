import { asc, eq } from 'drizzle-orm'
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

// The same events withdrawn, so a calendar that imported the booking's file takes them away again.
// Stamped now, which outranks the SEQUENCE of every file sent before (C-104 criterion 5).
export function cancellationAttachment(event: H3Event | undefined, bookings: Omit<CalendarEvent, 'status' | 'updatedAt'>[]): Attachment {
  const base = useRuntimeConfig(event).public.baseURL
  const now = Math.floor(Date.now() / 1000)
  return {
    filename: 'cancelled.ics',
    contentType: 'text/calendar; charset=utf-8; method=CANCEL',
    content: calendarFor(
      bookings.map(booking => ({ ...booking, status: 'CANCELLED', updatedAt: now })),
      { name: bookings[0]?.title ?? 'Cancelled', host: new URL(base).hostname, method: 'CANCEL' },
    ),
  }
}

// Several bookings in one file, for a message that confirms more than one at once.
export function bookingsAttachment(event: H3Event | undefined, bookings: CalendarEvent[]): Attachment {
  const base = useRuntimeConfig(event).public.baseURL
  return {
    filename: 'booking.ics',
    contentType: 'text/calendar; charset=utf-8',
    content: calendarFor(bookings, { name: bookings.length === 1 ? bookings[0]!.title : 'Room bookings', host: new URL(base).hostname }),
  }
}

// A series' occurrences as calendar events, read back after the write because the ids are made there.
export async function seriesEvents(seriesId: string, title: string, room: string): Promise<CalendarEvent[]> {
  const rows = await db.select({ id: schema.roomBookings.id, startsAt: schema.roomBookings.startsAt, endsAt: schema.roomBookings.endsAt, status: schema.roomBookings.status, updatedAt: schema.roomBookings.updatedAt })
    .from(schema.roomBookings)
    .where(eq(schema.roomBookings.seriesId, seriesId))
    .orderBy(asc(schema.roomBookings.startsAt))
  return rows.map(row => ({ ...row, title, room }))
}
