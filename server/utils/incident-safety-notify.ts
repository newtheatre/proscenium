import { notify } from './notify'
import { requiresFollowUp, safetyOfficers } from './incident-safety'
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

  const officers = await safetyOfficers()
  await Promise.all(officers.map(officer => notify(event, {
    userId: officer.id,
    type: 'incident.follow-up-required',
    context: {
      name: '',
      category,
      severity,
      safetyUrl: `${useRuntimeConfig(event).public.baseURL}/rota/manage/safety`,
    },
  })))
}
