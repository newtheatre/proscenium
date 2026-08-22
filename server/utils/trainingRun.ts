/**
 * The run: opening, ending and reading a sandbox. The only writer of the only
 * two tables training mode may touch (ADR-0032). Design: docs/14 §3
 */

import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { practiceWindow, type PracticeTarget } from './eligibility'
import type { AbilityUser } from '~~/shared/utils/abilities'

export type TrainingRun = typeof schema.trainingRuns.$inferSelect
export type TrainingEventKind = typeof schema.TRAINING_EVENT_KINDS[number]

/** Which sandbox each screen belongs to, so one run cannot open another. */
export const SURFACE_TARGET = {
  till: 'bar-till',
  ageChecks: 'challenge-25',
  door: 'door-scan',
} as const satisfies Record<string, PracticeTarget>

/** The run this user has open, if any. Expiry is checked, never trusted. */
export async function activeRun(userId: string, now: Date = new Date()): Promise<TrainingRun | null> {
  const run = await db.select().from(schema.trainingRuns)
    .where(and(eq(schema.trainingRuns.userId, userId), isNull(schema.trainingRuns.endedAt)))
    .orderBy(desc(schema.trainingRuns.startedAt))
    .get()

  if (!run) return null

  if (run.expiresAt <= now) {
    await endRun(run.id, 'EXPIRED')
    return null
  }

  return run
}

/**
 * Guard for every `/api/training/**` route. Refuses unless a run is open for
 * this exact surface, so a till sandbox cannot reach the door.
 */
export async function requireRun(event: H3Event, target: PracticeTarget): Promise<{ run: TrainingRun, user: AbilityUser }> {
  const { user } = await requireUserSession(event)
  const run = await activeRun(user.id)

  if (!run) {
    throw createError({ statusCode: 403, statusMessage: 'Practice is not open. Ask whoever is teaching you.' })
  }
  if (run.targetKey !== target) {
    throw createError({ statusCode: 403, statusMessage: 'That is not the sandbox you are practising in.' })
  }

  return { run, user }
}

/**
 * Open a run, but only if rehearsal says so. The expiry is theirs: this app
 * never extends a sandbox (ADR-0033).
 */
export async function startRun(user: AbilityUser, target: PracticeTarget): Promise<TrainingRun> {
  const existing = await activeRun(user.id)
  if (existing) {
    if (existing.targetKey === target) return existing
    // One sandbox at a time: leaving the old one open would leave a banner
    // pointing at a screen they are no longer on.
    await endRun(existing.id, 'ENDED')
  }

  const answer = await practiceWindow(user.id, target)
  if (!answer.active) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Practice is only open while you are being taught this. Ask whoever is teaching you.',
    })
  }

  const now = new Date()
  const expiresAt = answer.expiresAt ? new Date(answer.expiresAt) : null
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw createError({ statusCode: 403, statusMessage: 'That practice window has closed.' })
  }

  const [run] = await db.insert(schema.trainingRuns).values({
    userId: user.id,
    targetKey: target,
    trainingSessionId: answer.sessionId,
    startedAt: now,
    expiresAt,
  }).returning()

  return run!
}

/** End a run and delete what it did, together (docs/14 §9). */
export async function endRun(runId: string, reason: 'ENDED' | 'EXPIRED' | 'PURGED'): Promise<void> {
  await db.batch([
    db.update(schema.trainingRuns)
      .set({ endedAt: new Date(), endedReason: reason })
      .where(and(eq(schema.trainingRuns.id, runId), isNull(schema.trainingRuns.endedAt))),
    db.delete(schema.trainingRunEvents).where(eq(schema.trainingRunEvents.runId, runId)),
  ])
}

/** The one write a training request makes, besides the run itself. */
export async function recordEvent(
  runId: string,
  kind: TrainingEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.trainingRunEvents).values({
    runId,
    kind,
    payload,
    at: new Date(),
  })
}

export async function eventsFor(runId: string) {
  return db.select({
    id: schema.trainingRunEvents.id,
    kind: schema.trainingRunEvents.kind,
    payload: schema.trainingRunEvents.payload,
    at: schema.trainingRunEvents.at,
  })
    .from(schema.trainingRunEvents)
    .where(eq(schema.trainingRunEvents.runId, runId))
    .orderBy(asc(schema.trainingRunEvents.at))
}

/**
 * Which sandboxes this person could open right now. Asked on the FOH home,
 * so a member with no window sees no tile and no hint of the feature.
 */
export async function availableTargets(userId: string): Promise<PracticeTarget[]> {
  const answers = await Promise.all(
    (Object.values(SURFACE_TARGET) as PracticeTarget[]).map(async target => ({
      target,
      open: (await practiceWindow(userId, target)).active,
    })),
  )
  return answers.filter(answer => answer.open).map(answer => answer.target)
}

/**
 * Delete finished runs outright: events cascade with them. Anything past its
 * expiry counts as finished whether or not somebody pressed the button.
 */
export async function purgeRuns(before: Date): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.trainingRuns)
    .where(purgeable(before))

  if (Number(n) === 0) return 0

  await db.delete(schema.trainingRuns).where(purgeable(before))
  return Number(n)
}

/** Scoped by predicate, never by an id list (ADR-0006). */
function purgeable(before: Date) {
  return or(
    and(isNotNull(schema.trainingRuns.endedAt), lt(schema.trainingRuns.endedAt, before)),
    lt(schema.trainingRuns.expiresAt, before),
  )
}
