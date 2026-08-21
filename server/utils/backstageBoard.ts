import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, gte, lte, ne } from 'drizzle-orm'

/**
 * The comms board. Polled with a cursor rather than socketed (ADR-0021), and
 * acknowledgements are the reason it exists at all. Design: docs/11 §2.4
 */

/** Roughly how often a client polls; the stale banner is a few of these. */
export const POLL_INTERVAL_MS = 2500

export interface BoardSender {
  userId?: string
  sessionId?: string
  name: string
}

export async function listPresets(direction: 'FOH' | 'BACKSTAGE') {
  return db.select({
    id: schema.backstagePresets.id,
    label: schema.backstagePresets.label,
    milestone: schema.backstagePresets.milestone,
  })
    .from(schema.backstagePresets)
    .where(and(
      eq(schema.backstagePresets.direction, direction),
      eq(schema.backstagePresets.archived, false),
    ))
    .orderBy(asc(schema.backstagePresets.sort), asc(schema.backstagePresets.label))
}

/**
 * Send a preset or free text. The label is snapshotted, so rewording a preset
 * next term does not rewrite what was called on the night.
 */
export async function sendBoardMessage(input: {
  nightId: string
  direction: 'FOH' | 'BACKSTAGE'
  presetId?: string
  body?: string
  sender: BoardSender
}) {
  let label = input.body?.trim() ?? ''
  let milestone: (typeof schema.BOARD_MILESTONES)[number] | null = null

  if (input.presetId) {
    const preset = await db.select().from(schema.backstagePresets)
      .where(and(
        eq(schema.backstagePresets.id, input.presetId),
        eq(schema.backstagePresets.direction, input.direction),
      )).get()
    if (!preset) throw createError({ statusCode: 404, statusMessage: 'That call is not one of yours to send.' })
    label = preset.label
    milestone = preset.milestone
  }

  if (!label) throw createError({ statusCode: 400, statusMessage: 'Say something, or pick a call.' })

  const [row] = await db.insert(schema.backstageMessages).values({
    nightId: input.nightId,
    direction: input.direction,
    presetId: input.presetId ?? null,
    label,
    milestone,
    body: input.presetId ? null : label,
    senderUserId: input.sender.userId ?? null,
    senderSessionId: input.sender.sessionId ?? null,
    senderName: input.sender.name,
    createdAt: new Date(),
  }).returning()

  return row!
}

/** Messages after the cursor, oldest first. `since` is epoch milliseconds. */
export async function messagesSince(nightId: string, since?: number) {
  const clauses = [eq(schema.backstageMessages.nightId, nightId)]
  if (since) clauses.push(gt(schema.backstageMessages.createdAt, new Date(since)))

  return db.select({
    id: schema.backstageMessages.id,
    direction: schema.backstageMessages.direction,
    label: schema.backstageMessages.label,
    body: schema.backstageMessages.body,
    milestone: schema.backstageMessages.milestone,
    senderName: schema.backstageMessages.senderName,
    acknowledgedAt: schema.backstageMessages.acknowledgedAt,
    acknowledgedBy: schema.backstageMessages.acknowledgedBy,
    createdAt: schema.backstageMessages.createdAt,
  })
    .from(schema.backstageMessages)
    .where(and(...clauses))
    .orderBy(asc(schema.backstageMessages.createdAt))
    .limit(200)
}

/**
 * Acknowledge the other side's message. You cannot ack your own: the whole
 * value is one side seeing that the other has read it.
 */
export async function acknowledgeMessage(nightId: string, messageId: string, by: string, side: 'FOH' | 'BACKSTAGE') {
  const [row] = await db.update(schema.backstageMessages)
    .set({ acknowledgedAt: new Date(), acknowledgedBy: by })
    .where(and(
      eq(schema.backstageMessages.id, messageId),
      eq(schema.backstageMessages.nightId, nightId),
      ne(schema.backstageMessages.direction, side),
    ))
    .returning()

  if (!row) throw createError({ statusCode: 404, statusMessage: 'That message is not one of yours to acknowledge.' })
  return row
}

/**
 * The one piece of box office data that crosses to backstage: admitted against
 * expected, and nothing else (docs/11 §5.2).
 */
export async function houseCountFor(night: string) {
  const performances = await db.select({
    id: schema.performances.id,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
    intervalCount: schema.performances.intervalCount,
  })
    .from(schema.performances)
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(and(
      gte(schema.performances.startsAt, validityStart(night)),
      lte(schema.performances.startsAt, validityEnd(night)),
      ne(schema.performances.status, 'CANCELLED'),
    ))
    .orderBy(asc(schema.performances.startsAt))

  let admitted = 0
  let expected = 0
  for (const performance of performances) {
    admitted += await countCollectedSeatsFor(performance.id)
    expected += await countOccupiedSeatsFor(performance.id)
  }

  const first = performances[0]
  return {
    admitted,
    expected,
    showTitle: first?.showTitle ?? null,
    startsAt: first?.startsAt ?? null,
    intervalCount: first?.intervalCount ?? 0,
  }
}
