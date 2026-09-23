import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { configValue } from './configuration'
import { notify } from './notify'
import { render } from './templates'
import { auditEntry } from '#shared/utils/audit'
import { londonDay } from '#shared/utils/membership'
import { announcementType } from '#shared/utils/announcements'
import { HOLDING_STATUSES } from '#shared/utils/capacity'
import { messageType } from '#shared/utils/notifications'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import type { AnnounceShowOption, AudienceDefinition, ComposeAnnouncementInput } from '#shared/utils/announcements'
import type { Outcome } from './notify'
import type { Rendered } from '#server/utils/templates'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// Admin fan-out (H-108). Each audience is its own small query rather than a shared predicate
// imported from `directory.ts`, kept self-contained for the Bun graph (CONTRIBUTING).

// Anonymised excluded at the query layer in every branch (H-107 criterion 2): a fan-out cannot
// enumerate one even by a caller's mistake, because the row is never in the result at all.

export function allCurrentMembersQuery(today: string, graceDays: number): SQL {
  return sql`
    SELECT u.id AS id
    FROM users u
    WHERE u.anonymised_at IS NULL
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.user_id = u.id
          AND m.starts_on <= ${today}
          AND date(m.expires_on, ${`+${graceDays} days`}) >= ${today}
      )
  `
}

export function roleHoldersQuery(role: string, nowEpoch: number): SQL {
  return sql`
    SELECT u.id AS id
    FROM users u
    WHERE u.anonymised_at IS NULL
      AND EXISTS (
        SELECT 1 FROM role_grants rg
        WHERE rg.user_id = u.id AND rg.role = ${role}
          AND (rg.expires_at IS NULL OR rg.expires_at > ${nowEpoch})
      )
  `
}

// A confirmed or claimed slot only: an open or declined one names nobody to reach (E-105).
export function tonightsRotaQuery(night: string): SQL {
  return sql`
    SELECT DISTINCT u.id AS id
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN users u ON u.id = s.user_id
    WHERE s.status IN ('CLAIMED', 'CONFIRMED')
      AND u.anonymised_at IS NULL
      AND date(p.starts_at, 'unixepoch', '-4 hours') = ${night}
  `
}

export function sessionSignupsQuery(sessionId: string): SQL {
  return sql`
    SELECT DISTINCT u.id AS id
    FROM session_attendees sa
    JOIN users u ON u.id = sa.user_id
    WHERE sa.session_id = ${sessionId} AND sa.status <> 'CANCELLED' AND u.anonymised_at IS NULL
  `
}

// A live booking with a seat still owned: held, collected or admitted, and not wholly refunded.
// One account per address, so DISTINCT is one message per address (H-108 criterion 8, 0089).
function ticketHoldersQuery(performances: SQL): SQL {
  // Literals from a fixed constant, so the statement binds only what the caller scopes it by.
  const holding = sql.raw(HOLDING_STATUSES.map(status => `'${status}'`).join(', '))
  return sql`
    SELECT DISTINCT u.id AS id
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    WHERE r.performance_id IN (${performances})
      AND r.status IN (${holding})
      AND u.anonymised_at IS NULL
      AND EXISTS (SELECT 1 FROM tickets t WHERE t.reservation_id = r.id AND t.refunded_at IS NULL)
  `
}

// `from` is the start of tonight's show night (0014): a past performance's bookers, imported
// history included, are never an audience (0089).
export function performanceTicketHoldersQuery(performanceId: string, from: number): SQL {
  return ticketHoldersQuery(sql`SELECT p.id FROM performances p WHERE p.id = ${performanceId} AND p.starts_at >= ${from}`)
}

// The run's remaining nights as a subquery, never a list of ids read back first (0006).
export function showTicketHoldersQuery(showId: string, from: number): SQL {
  return ticketHoldersQuery(sql`SELECT p.id FROM performances p WHERE p.show_id = ${showId} AND p.starts_at >= ${from}`)
}

// Epoch seconds at which a show night opens, 04:00 London (0014).
function nightOpensAt(night: string): number {
  return Math.floor(showNightBounds(night).from.getTime() / 1000)
}

export interface AnnounceSessionOption {
  id: string
  title: string
  heldOn: string
  startsAt: string
}

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// H-924: a session is chosen by what it teaches or its date, never typed as an id (0032). Column
// allow-listed, since a comms.announce holder need not hold training.read.
export function announceSessionsQuery(term: string): SQL {
  const like = contains(term)
  return sql`
    SELECT s.id AS id, group_concat(m.name, ', ') AS title, s.held_on AS heldOn, s.starts_at AS startsAt
    FROM training_sessions s
    JOIN session_modules sm ON sm.session_id = s.id
    JOIN modules m ON m.id = sm.module_id
    GROUP BY s.id
    HAVING title LIKE ${like} ESCAPE '\\' OR s.held_on LIKE ${like} ESCAPE '\\'
    ORDER BY s.held_on DESC
    LIMIT 20
  `
}

export async function announceSessions(term: string): Promise<AnnounceSessionOption[]> {
  return db.all<AnnounceSessionOption>(announceSessionsQuery(term))
}

export interface AnnounceShowRow {
  showId: string
  title: string
  performanceId: string
  startsAt: number
  status: string
  venueName: string
}

// A show that is not a draft, by its title, with its performances from tonight's show night on;
// a cancelled one stays listed, since its holders most need telling. Titles and times are public.
export function announceShowsQuery(term: string, from: number): SQL {
  const like = contains(term)
  return sql`
    SELECT s.id AS showId, s.title AS title, p.id AS performanceId, p.starts_at AS startsAt,
      p.status AS status, v.name AS venueName
    FROM shows s
    JOIN performances p ON p.show_id = s.id AND p.starts_at >= ${from}
    JOIN venues v ON v.id = p.venue_id
    WHERE s.id IN (
      SELECT s2.id FROM shows s2
      WHERE s2.status <> 'DRAFT' AND s2.title LIKE ${like} ESCAPE '\\'
        AND EXISTS (SELECT 1 FROM performances p2 WHERE p2.show_id = s2.id AND p2.starts_at >= ${from})
      ORDER BY (SELECT min(p3.starts_at) FROM performances p3 WHERE p3.show_id = s2.id AND p3.starts_at >= ${from})
      LIMIT 20
    )
    ORDER BY s.title, s.id, p.starts_at
  `
}

export async function announceShows(term: string): Promise<AnnounceShowOption[]> {
  const found = await db.all<AnnounceShowRow>(announceShowsQuery(term, nightOpensAt(currentShowNight())))
  const shows = new Map<string, AnnounceShowOption>()
  for (const row of found) {
    const show = shows.get(row.showId) ?? { id: row.showId, title: row.title, performances: [] }
    show.performances.push({ id: row.performanceId, startsAt: row.startsAt, status: row.status, venueName: row.venueName })
    shows.set(row.showId, show)
  }
  return [...shows.values()]
}

export interface AudienceContext {
  today: string
  graceDays: number
  nowEpoch: number
  night: string
}

export function audienceQuery(audience: AudienceDefinition, context: AudienceContext): SQL {
  if (audience.kind === 'ALL_CURRENT_MEMBERS') return allCurrentMembersQuery(context.today, context.graceDays)
  if (audience.kind === 'ROLE_HOLDERS') return roleHoldersQuery(audience.role, context.nowEpoch)
  if (audience.kind === 'TONIGHT_ROTA') return tonightsRotaQuery(context.night)
  if (audience.kind === 'PERFORMANCE_TICKET_HOLDERS') return performanceTicketHoldersQuery(audience.performanceId, nightOpensAt(context.night))
  if (audience.kind === 'SHOW_TICKET_HOLDERS') return showTicketHoldersQuery(audience.showId, nightOpensAt(context.night))
  return sessionSignupsQuery(audience.sessionId)
}

async function contextFor(event: H3Event): Promise<AudienceContext> {
  const now = new Date()
  return {
    // London, not UTC (0014): the runtime clock is UTC, and half the year that is the wrong day.
    today: londonDay(now),
    graceDays: await configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    nowEpoch: Math.floor(now.getTime() / 1000),
    night: currentShowNight(),
  }
}

// Resolved fresh from live data at send time, never a pasted list (criterion 1): the same
// resolver a preview and a send both call, so what was counted is what is reached.
export async function resolveAudience(event: H3Event, audience: AudienceDefinition): Promise<string[]> {
  const rows = await db.all<{ id: string }>(audienceQuery(audience, await contextFor(event)))
  return rows.map(row => row.id)
}

// The composer's own view of what it is about to send: a count and the rendered message, never
// the recipient list itself (criterion 4).
export async function previewAnnouncement(event: H3Event, input: ComposeAnnouncementInput, previewName: string): Promise<{ count: number, rendered: Rendered }> {
  const ids = await resolveAudience(event, input.audience)
  const rendered = render(messageType(announcementType(input.audience, input.safetyNotice)).template, {
    name: previewName,
    subject: input.subject,
    body: input.body,
  })
  return { count: ids.length, rendered }
}

export interface AnnouncementOutcome {
  recipientId: string
  // Widened for `admin.announcement`, which carries the announcements topic and can join the
  // next digest for it exactly like any other unclaimed, topic-bearing send (H-104).
  status: Outcome
}

// A plain announcement writes no send-log row of its own, so the composer must say it was held
// rather than sent, and an officer is not sent to the send log to look for nothing (0061, H-104).
export function heldForDigest(outcomes: AnnouncementOutcome[]): number {
  return outcomes.filter(outcome => outcome.status === 'HELD_FOR_DIGEST').length
}

// One `notify()` call per recipient (criterion 2): every provider send carries one address, so no
// recipient's header or body ever names another. Outcomes land in the send log by that call alone.
export async function sendAnnouncement(event: H3Event, actorId: string, input: ComposeAnnouncementInput): Promise<{ count: number, outcomes: AnnouncementOutcome[] }> {
  const ids = await resolveAudience(event, input.audience)
  const type = announcementType(input.audience, input.safetyNotice)

  const outcomes: AnnouncementOutcome[] = []
  for (const userId of ids) {
    const status = await notify(event, { type, userId, context: { name: '', subject: input.subject, body: input.body } })
    outcomes.push({ recipientId: userId, status })
  }

  // No subject and no body here, both the officer's own prose (0011): `notification_log.subject`
  // is where "what did this actually say" is answered from, one row per recipient.
  await db.insert(schema.auditLog).values(auditEntry({
    actorId,
    action: 'comms.announcement.sent',
    detail: {
      audienceKind: input.audience.kind,
      ...(input.audience.kind === 'ROLE_HOLDERS' ? { role: input.audience.role } : {}),
      ...(input.audience.kind === 'SESSION_SIGNUPS' ? { sessionId: input.audience.sessionId } : {}),
      ...(input.audience.kind === 'PERFORMANCE_TICKET_HOLDERS' ? { performanceId: input.audience.performanceId } : {}),
      ...(input.audience.kind === 'SHOW_TICKET_HOLDERS' ? { showId: input.audience.showId } : {}),
      recipientCount: ids.length,
      safetyNotice: input.safetyNotice,
    },
  }))

  return { count: ids.length, outcomes }
}
