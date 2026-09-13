import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { eligibilityRefusal } from '#shared/utils/rota-eligibility'
import { SHIFT_ROLES } from '#shared/utils/rota'

const query = z.object({ search: z.string().trim().min(1).max(200), role: z.enum(SHIFT_ROLES) })

export interface AddShiftCandidate { id: string, name: string, email: string, eligible: boolean }

// Who might take a role on a shift that does not exist yet (issue 933): the same match and live
// eligibility `[id]/candidates` gives an existing one, named by role rather than by shift.
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.write')
  const { search, role } = await getValidatedQueryOrThrow(event, query)

  const term = contains(search.toLowerCase())
  const matched = await db.all<{ id: string, name: string, email: string }>(sql`
    SELECT id, name, email FROM users
    WHERE anonymised_at IS NULL AND disabled = 0
      AND (lower(name) LIKE ${term} ESCAPE '\\' OR lower(email) LIKE ${term} ESCAPE '\\')
    ORDER BY name COLLATE NOCASE
    LIMIT 10
  `)

  const rules = await shiftRoleRules(event)
  const today = londonToday()
  const items: AddShiftCandidate[] = await Promise.all(matched.map(async (row) => {
    const heldModules = await modulesHeldBy(row.id, today)
    return { ...row, eligible: eligibilityRefusal(rules[role], heldModules) === null }
  }))

  return { items }
})
