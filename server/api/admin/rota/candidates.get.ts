import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { candidateLock, needsCommitteeRole } from '#shared/utils/rota-eligibility'
import { SHIFT_ROLES } from '#shared/utils/rota'

const query = z.object({ search: z.string().trim().min(1).max(200), role: z.enum(SHIFT_ROLES), performanceId: z.string().min(1).max(64).optional() })

export interface AddShiftCandidate { id: string, name: string, email: string, eligible: boolean, reason: string | null }

// Who might take a role on a shift that does not exist yet (issue 933): the same match and live
// eligibility `[id]/candidates` gives an existing one, named by role rather than by shift.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const { search, role, performanceId } = await getValidatedQueryOrThrow(event, query)

  const term = contains(search.toLowerCase())
  // Adding names somebody, and a person holds one shift per performance, as an assignment refuses.
  const onPerformance = performanceId === undefined
    ? sql`0`
    : sql`EXISTS (SELECT 1 FROM shifts other WHERE other.performance_id = ${performanceId}
        AND other.user_id = users.id AND other.status IN ('CLAIMED', 'CONFIRMED'))`
  const matched = await db.all<{ id: string, name: string, email: string, onPerformance: number }>(sql`
    SELECT id, name, email, ${onPerformance} AS onPerformance FROM users
    WHERE anonymised_at IS NULL AND disabled = 0
      AND (lower(name) LIKE ${term} ESCAPE '\\' OR lower(email) LIKE ${term} ESCAPE '\\')
    ORDER BY name COLLATE NOCASE
    LIMIT 10
  `)

  const rules = await shiftRoleRules(event)
  const moduleId = rules[role]
  const moduleName = moduleId === null ? null : (await gatingModules([moduleId])).get(moduleId)?.name ?? null
  const today = londonToday()
  const items: AddShiftCandidate[] = await Promise.all(matched.map(async ({ onPerformance: on, ...row }) => {
    const [heldModules, committee] = await Promise.all([modulesHeldBy(row.id, today), needsCommitteeRole(role) ? hasCommitteeRole(row.id) : true])
    const reason = candidateLock({ role, moduleId, moduleName, held: heldModules, committee, onPerformance: on === 1 })
    return { ...row, eligible: reason === null, reason }
  }))

  return { items }
})
