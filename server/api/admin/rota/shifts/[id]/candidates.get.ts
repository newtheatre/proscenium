import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { eligibilityRefusal } from '#shared/utils/rota-eligibility'

const query = z.object({ search: z.string().trim().min(1).max(200) })

export interface AssignCandidate { id: string, name: string, email: string, eligible: boolean }

// `%` and `_` are LIKE wildcards; a search for an address containing either would otherwise
// match more than was typed (the same escape every other search route in the app applies).
const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Who the officer might assign, matched by name or email and carrying the same live eligibility
// the assignment applies. Scoped to `rota.write`, never the account directory (E-107 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'rota.write')
  const { search } = await getValidatedQueryOrThrow(event, query)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

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
  const items: AssignCandidate[] = await Promise.all(matched.map(async (row) => {
    const heldModules = await modulesHeldBy(row.id, today)
    return { ...row, eligible: eligibilityRefusal(rules[held.role], heldModules) === null }
  }))

  return { items }
})
