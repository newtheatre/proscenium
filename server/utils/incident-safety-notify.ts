import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { notify } from './notify'
import { requiresFollowUp, safetyOfficers } from './incident-safety'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { saysWhenLong } from '#shared/utils/when'
import type { Category, Severity } from '#shared/utils/incidents'
import type { H3Event } from 'h3'

// Kept apart from server/utils/incident-safety.ts, which `tests/` imports directly under Bun:
// reading the base URL needs a live Nitro runtime, the split `waiting-list-notify.ts` keeps (0057).

// Called after a successful write, never before: a notification for an incident that failed to
// log would be a lie about what happened (E-116 criterion 2).
export async function notifySafetyOfficersIfNeeded(
  event: H3Event, incidentId: string, category: Category, severity: Severity,
): Promise<void> {
  if (!(await requiresFollowUp(severity))) return

  // Where and when, never what: the email carries no free text from the entry (0011, 0235).
  const [logged] = await db.all<{ venueName: string, happenedAt: number }>(sql`
    SELECT v.name AS venueName, i.happened_at AS happenedAt
    FROM incidents i JOIN performances p ON p.id = i.performance_id JOIN venues v ON v.id = p.venue_id
    WHERE i.id = ${incidentId}
  `)

  const officers = await safetyOfficers()
  await Promise.all(officers.map(officer => notify(event, {
    userId: officer.id,
    type: 'incident.follow-up-required',
    context: {
      name: '',
      category: saysCategory(category).toLowerCase(),
      severity: saysSeverity(severity).toLowerCase(),
      venue: logged?.venueName ?? null,
      when: logged ? saysWhenLong(logged.happenedAt) : null,
      safetyUrl: `${useRuntimeConfig(event).public.baseURL}/rota/manage/safety`,
    },
  })))
}
