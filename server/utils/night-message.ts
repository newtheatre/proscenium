import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { performanceTicketHoldersQuery } from './announcements'
import { claimNotification, notify } from './notify'
import { render } from './templates'
import { auditEntry } from '#shared/utils/audit'
import { messageType } from '#shared/utils/notifications'
import { NIGHT_MESSAGE_TAKEOVER_SECONDS, nightMessageClaim, nightMessageDraftPrefix, nightMessageType } from '#shared/utils/night-message'
import { showNightOpensAt } from '#shared/utils/show-night'
import type { Rendered } from './templates'
import type { NightAuthorityVia } from '#shared/utils/night-authority'
import type { NightAudience, NightMessageInput, NightMessageOutcome } from '#shared/utils/night-message'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// Tonight's duty manager messages one of tonight's performances (0101, issue 1327): its ticket
// holders through the announce composer's own resolver (0089), or the people working it.

// A confirmed or claimed slot on this performance only, the rota `tonightsRotaQuery` reads for the
// whole night, narrowed to the house the duty manager chose (E-127).
export function performanceRotaQuery(performanceId: string): SQL {
  return sql`
    SELECT DISTINCT u.id AS id
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    WHERE s.performance_id = ${performanceId}
      AND s.status IN ('CLAIMED', 'CONFIRMED')
      AND u.anonymised_at IS NULL
  `
}

// `from` is tonight's show night opening, so a performance already past has no ticket holders.
export function nightAudienceQuery(audience: NightAudience, performanceId: string, from: number): SQL {
  return audience === 'TICKET_HOLDERS' ? performanceTicketHoldersQuery(performanceId, from) : performanceRotaQuery(performanceId)
}

export async function resolveNightAudience(audience: NightAudience, performanceId: string, night: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(nightAudienceQuery(audience, performanceId, showNightOpensAt(night)))
  return rows.map(row => row.id)
}

export async function previewNightMessage(input: NightMessageInput, night: string, previewName: string): Promise<{ count: number, rendered: Rendered }> {
  const ids = await resolveNightAudience(input.audience, input.performanceId, night)
  const rendered = render(messageType(nightMessageType(input.audience)).template, { name: previewName, subject: input.subject, body: input.body })
  return { count: ids.length, rendered }
}

export const TAKEN_OVER = 'Interrupted before its outcome was recorded; a retry of the same draft sent it again (0108).'

// This sender's own claims on this draft still PENDING past the takeover age, freed in the one
// statement that takes them: renamed off the key, so the loop claims afresh (0003, 0108).
export function takeOverInterruptedQuery(draftKey: string, senderId: string, now: number): SQL {
  const prefix = nightMessageDraftPrefix(draftKey, senderId)
  return sql`
    UPDATE notification_log
    SET status = 'FAILED_FINAL', error = ${TAKEN_OVER}, claim = 'interrupted:' || claim || ':' || id
    WHERE substr(claim, 1, ${prefix.length}) = ${prefix}
      AND status = 'PENDING'
      AND created_at <= ${now - NIGHT_MESSAGE_TAKEOVER_SECONDS}
    RETURNING user_id AS userId
  `
}

// What this draft already holds once the takeover has run: copies out, and copies still in flight.
export function draftClaimsQuery(draftKey: string, senderId: string): SQL {
  const prefix = nightMessageDraftPrefix(draftKey, senderId)
  return sql`
    SELECT coalesce(sum(status != 'PENDING'), 0) AS alreadyOut, coalesce(sum(status = 'PENDING'), 0) AS stillSending
    FROM notification_log
    WHERE substr(claim, 1, ${prefix.length}) = ${prefix}
  `
}

// The announce composer's audit action, so one reading of the audit trail answers both screens;
// `via` says whether a shift or an officer's standing sent it (0044). Never the officer's prose (0011).
export async function sendNightMessage(event: H3Event, actorId: string, via: NightAuthorityVia, input: NightMessageInput, night: string): Promise<NightMessageOutcome> {
  const ids = await resolveNightAudience(input.audience, input.performanceId, night)
  const type = nightMessageType(input.audience)
  const now = Math.floor(Date.now() / 1000)
  const takenOver = new Set((await db.all<{ userId: string | null }>(takeOverInterruptedQuery(input.draftKey, actorId, now))).map(row => row.userId))
  const [held] = await db.all<{ alreadyOut: number, stillSending: number }>(draftClaimsQuery(input.draftKey, actorId))
  let reached = 0
  let resent = 0

  // Each copy is claimed under the draft before it sends, so a second press of the same draft
  // reaches only those not yet reached (0048); a press that throws part-way still audits what went.
  try {
    for (const userId of ids) {
      const claim = nightMessageClaim(input.draftKey, actorId, userId)
      if (!await claimNotification({ userId, type, key: claim, recordId: input.performanceId })) continue
      await notify(event, { type, userId, claim, context: { name: '', subject: input.subject, body: input.body } })
      reached += 1
      if (takenOver.has(userId)) resent += 1
    }
  }
  finally {
    await db.insert(schema.auditLog).values(auditEntry({
      actorId,
      action: 'comms.announcement.sent',
      detail: {
        audienceKind: input.audience === 'TICKET_HOLDERS' ? 'PERFORMANCE_TICKET_HOLDERS' : 'PERFORMANCE_ROTA',
        performanceId: input.performanceId,
        recipientCount: reached,
        safetyNotice: true,
        via,
      },
    }))
  }

  return { count: reached, alreadyOut: held?.alreadyOut ?? 0, resent, stillSending: held?.stillSending ?? 0 }
}
