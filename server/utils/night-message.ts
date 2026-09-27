import { db, schema } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { performanceTicketHoldersQuery } from './announcements'
import { claimNotification, notify } from './notify'
import { render } from './templates'
import { auditEntry } from '#shared/utils/audit'
import { messageType } from '#shared/utils/notifications'
import { nightMessageClaim, nightMessageType } from '#shared/utils/night-message'
import { showNightOpensAt } from '#shared/utils/show-night'
import type { Rendered } from './templates'
import type { NightAuthorityVia } from '#shared/utils/night-authority'
import type { NightAudience, NightMessageInput } from '#shared/utils/night-message'
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

// Each copy is claimed under the draft before it sends, so a second press of the same draft reaches
// only those not yet reached and counts them alone (0048). A claim never sent stays PENDING.
async function sendOnce(event: H3Event, ids: string[], input: NightMessageInput): Promise<number> {
  const type = nightMessageType(input.audience)
  let reached = 0
  for (const userId of ids) {
    const claim = nightMessageClaim(input.draftKey, userId)
    if (!await claimNotification({ userId, type, key: claim, recordId: input.performanceId })) continue
    await notify(event, { type, userId, claim, context: { name: '', subject: input.subject, body: input.body } })
    reached += 1
  }
  return reached
}

// The announce composer's audit action, so one reading of the audit trail answers both screens;
// `via` says whether a shift or an officer's standing sent it (0044). Never the officer's prose (0011).
export async function sendNightMessage(event: H3Event, actorId: string, via: NightAuthorityVia, input: NightMessageInput, night: string): Promise<{ count: number }> {
  const ids = await resolveNightAudience(input.audience, input.performanceId, night)
  const reached = await sendOnce(event, ids, input)

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

  return { count: reached }
}
