import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { configValue } from './configuration'
import { notify } from './notify'
import { render } from './templates'
import { auditEntry } from '#shared/utils/audit'
import { londonDay } from '#shared/utils/membership'
import { messageType } from '#shared/utils/notifications'
import { currentShowNight } from '#shared/utils/show-night'
import type { AudienceDefinition, ComposeAnnouncementInput } from '#shared/utils/announcements'
import type { NotificationStatus } from '#shared/utils/notifications'
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

function typeFor(safetyNotice: boolean): string {
  return safetyNotice ? 'admin.safety-notice' : 'admin.announcement'
}

// The composer's own view of what it is about to send: a count and the rendered message, never
// the recipient list itself (criterion 4).
export async function previewAnnouncement(event: H3Event, input: ComposeAnnouncementInput, previewName: string): Promise<{ count: number, rendered: Rendered }> {
  const ids = await resolveAudience(event, input.audience)
  const rendered = render(messageType(typeFor(input.safetyNotice)).template, {
    name: previewName,
    subject: input.subject,
    body: input.body,
  })
  return { count: ids.length, rendered }
}

export interface AnnouncementOutcome {
  recipientId: string
  status: NotificationStatus
}

// One `notify()` call per recipient (criterion 2): every provider send carries one address, so no
// recipient's header or body ever names another. Outcomes land in the send log by that call alone.
export async function sendAnnouncement(event: H3Event, actorId: string, input: ComposeAnnouncementInput): Promise<{ count: number, outcomes: AnnouncementOutcome[] }> {
  const ids = await resolveAudience(event, input.audience)
  const type = typeFor(input.safetyNotice)

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
      recipientCount: ids.length,
      safetyNotice: input.safetyNotice,
    },
  }))

  return { count: ids.length, outcomes }
}
