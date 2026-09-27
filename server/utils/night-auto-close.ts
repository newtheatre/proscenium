import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { auditedWrite } from './audit'
import { boardResetRecipients, venueName } from './backstage'
import { compileNightReport } from './night-report'
import { distributeReport, reportForPerformance, signOffStatement } from './night-signoff'
import { configValue } from './configuration'
import { claimNotification, notify } from './notify'
import { performanceNight } from './performances'
import { render } from './templates'
import { auditEntry } from '#shared/utils/audit'
import { showNightBounds, showNightOpensAt } from '#shared/utils/show-night'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

// Auto-close within 24 hours (E-125): any performance nobody signed off freezes itself, marked
// as such, the same distribution and officer notice a human close gets.

export interface UnclosedCandidateRow { performanceId: string, venueId: string, startsAt: number }

// Bounded to performances that have started since the first night the system ran; the 24-hour
// cut itself is computed per row in `performancesDueAutoClose`, timezone-aware (0014).
export function unclosedCandidatesQuery(now: number, from: number): SQL {
  return sql`
    SELECT p.id AS performanceId, p.venue_id AS venueId, p.starts_at AS startsAt
    FROM performances p
    LEFT JOIN night_reports nr ON nr.performance_id = p.id
    WHERE nr.id IS NULL AND p.status != 'CANCELLED' AND p.starts_at >= ${from} AND p.starts_at < ${now}
  `
}

// That night's 04:00 start, or null with no night named: an unset key closes nothing, never
// everything the import brought in (0019).
export function autoCloseFrom(fromNight: string | null): number | null {
  return fromNight === null ? null : showNightOpensAt(fromNight)
}

export interface DuePerformance { performanceId: string, venueId: string, night: string }

// Pure, so the boundary is proved without a database: 24 hours after the show night's own end,
// timezone-aware through `showNightBounds`, never a wall-clock day (0014).
export function autoCloseDeadline(startsAt: number): { night: string, deadline: number } {
  const night = performanceNight(startsAt)
  return { night, deadline: showNightBounds(night).to.getTime() + 24 * 60 * 60 * 1000 }
}

export async function performancesDueAutoClose(at: Date = new Date()): Promise<DuePerformance[]> {
  const now = Math.floor(at.getTime() / 1000)
  // Unset closes nothing and warns, the nudge to set it; only the unset refusal (503) is caught,
  // so a failed read throws rather than looking like a quiet night.
  const from = autoCloseFrom(await configValue(undefined, 'AUTO_CLOSE_FROM_NIGHT').catch((error: unknown) => {
    if ((error as { statusCode?: number }).statusCode === 503) return null
    throw error
  }))
  if (from === null) {
    console.warn('configuration: AUTO_CLOSE_FROM_NIGHT is unset; nights:close closes nothing')
    return []
  }
  const candidates = await db.all<UnclosedCandidateRow>(unclosedCandidatesQuery(now, from))

  const due: DuePerformance[] = []
  for (const candidate of candidates) {
    const { night, deadline } = autoCloseDeadline(candidate.startsAt)
    if (at.getTime() >= deadline) due.push({ performanceId: candidate.performanceId, venueId: candidate.venueId, night })
  }
  return due
}

const CLOSING_NOTE = 'Closed automatically: no signatory within 24 hours of the show night ending.'

// One performance, start to finish (criteria 1, 2). Idempotent on `signOffStatement`'s own
// predicate (criterion 4): a re-run finds the row already there and reports nothing done.
export async function autoCloseNight(event: H3Event | undefined, target: DuePerformance): Promise<boolean> {
  const report = await compileNightReport(target.performanceId, target.venueId, target.night)
  const entry = auditEntry({
    actorId: null,
    action: 'night-report.auto-closed',
    target: `performance:${target.performanceId}`,
    detail: { night: target.night },
  })

  const closed = await auditedWrite(
    db.all<{ id: string }>(signOffStatement({
      id: newId(),
      performanceId: target.performanceId,
      venueId: target.venueId,
      night: target.night,
      closingNote: CLOSING_NOTE,
      report,
      signedBy: null,
      signedVia: 'SYSTEM',
    })),
    entry,
  )
  if (!closed) return false

  const row = await reportForPerformance(target.performanceId)
  if (!row) return false

  const venue = (await venueName(target.venueId)) ?? 'the venue'
  const message = render('night-report-auto-closed', {
    name: '',
    venueName: venue,
    night: row.night,
    closingNote: row.closingNote,
  })
  await distributeReport(event, row.id, null, null, message)

  // The same standing audience `boardResetRecipients()` was built for: whoever holds
  // `night.manage` (E-122), reused here for the officer notice criterion 3 asks for.
  const officers = await boardResetRecipients()
  for (const officer of officers) {
    const claim = `night-auto-closed:${target.performanceId}:${officer.id}`
    const took = await claimNotification({
      userId: officer.id,
      type: 'night.auto-closed',
      key: claim,
      recordId: target.performanceId,
    })
    if (!took) continue

    await notify(event, {
      userId: officer.id,
      type: 'night.auto-closed',
      claim,
      context: { name: '', venueName: venue, night: row.night },
    })
  }

  return true
}
