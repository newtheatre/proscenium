import { sql } from 'drizzle-orm'
import { eligibilityRefusal, UNCONFIGURED_ELIGIBILITY_RULE } from '#shared/utils/rota-eligibility'
import { SHIFT_ROLES } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'
import type { H3Event } from 'h3'

// The committee's mapping, read once per request and reused for every shift on the page: no
// per-row query and no cache window (E-103 criteria 1 and 4).
export async function shiftRoleRules(event: H3Event): Promise<Record<ShiftRole, string | null>> {
  const [DUTY_MANAGER, DOOR, BAR] = await Promise.all([
    configValue(event, 'SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE'),
    configValue(event, 'SHIFT_ELIGIBILITY_DOOR_MODULE'),
    configValue(event, 'SHIFT_ELIGIBILITY_BAR_MODULE'),
  ])
  return { DUTY_MANAGER, DOOR, BAR }
}

export interface ShiftEligibility {
  eligible: boolean
  // What would unlock it, for a role the member does not qualify for. Null both when eligible
  // and when the committee has not named a module yet: there is nothing to link to either way.
  unlockedBy: { moduleId: string, moduleName: string } | null
}

async function moduleNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db.all<{ id: string, name: string }>(sql`
    SELECT id, name FROM modules WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
  `)
  return new Map(rows.map(row => [row.id, row.name]))
}

// Held modules come from `modulesHeldBy()`, never a copy of it: an EXPIRING record counts as
// held here exactly because it does there, and this is one request's own read (criteria 1, 3).
export async function shiftEligibilities(
  event: H3Event,
  userId: string,
  today: string,
): Promise<Record<ShiftRole, ShiftEligibility>> {
  const rules = await shiftRoleRules(event)
  const held = await modulesHeldBy(userId, today)

  const named = [...new Set(SHIFT_ROLES.map(role => rules[role]).filter((id): id is string => id !== null))]
  const names = await moduleNames(named)

  const result = {} as Record<ShiftRole, ShiftEligibility>
  for (const role of SHIFT_ROLES) {
    const refusal = eligibilityRefusal(rules[role], held)
    result[role] = refusal === null
      ? { eligible: true, unlockedBy: null }
      : {
          eligible: false,
          unlockedBy: refusal === UNCONFIGURED_ELIGIBILITY_RULE
            ? null
            : { moduleId: refusal, moduleName: names.get(refusal) ?? refusal },
        }
  }
  return result
}
