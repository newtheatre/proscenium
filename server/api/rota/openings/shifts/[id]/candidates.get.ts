import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ALREADY_ON_OPENING, candidateLock } from '#shared/utils/rota-eligibility'

const query = z.object({ search: z.string().trim().min(1).max(200) })

export interface OpeningCandidate { id: string, name: string, email: string, eligible: boolean, reason: string | null }

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Who the officer might put on a bar opening's slot, with the same gate the assignment applies:
// bar training, and one slot per person per opening (0250, E-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'rota.write')
  const { search } = await getValidatedQueryOrThrow(event, query)

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const term = contains(search.toLowerCase())
  const matched = await db.all<{ id: string, name: string, email: string, onOpening: number }>(sql`
    SELECT id, name, email, EXISTS (
      SELECT 1 FROM bar_opening_shifts other
      WHERE other.opening_id = ${held.openingId} AND other.id <> ${id}
        AND other.user_id = users.id AND other.status IN ('CLAIMED', 'CONFIRMED')
    ) AS onOpening
    FROM users
    WHERE anonymised_at IS NULL AND disabled = 0
      AND (lower(name) LIKE ${term} ESCAPE '\\' OR lower(email) LIKE ${term} ESCAPE '\\')
    ORDER BY name COLLATE NOCASE
    LIMIT 10
  `)

  const moduleId = (await shiftRoleRules(event)).BAR
  const moduleName = moduleId === null ? null : (await gatingModules([moduleId])).get(moduleId)?.name ?? null
  const today = londonToday()
  const items: OpeningCandidate[] = await Promise.all(matched.map(async ({ onOpening, ...row }) => {
    const gate = candidateLock({ role: 'BAR', moduleId, moduleName, held: await modulesHeldBy(row.id, today), committee: true, onPerformance: false })
    const reason = gate ?? (onOpening === 1 ? ALREADY_ON_OPENING : null)
    return { ...row, eligible: reason === null, reason }
  }))

  return { items }
})
