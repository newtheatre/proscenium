import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ALREADY_ON_OPENING, candidateLock } from '#shared/utils/rota-eligibility'
import { currentShowNight, showNightOpensAt } from '#shared/utils/show-night'

const query = z.object({ search: z.string().trim().max(200).default('') })

export interface OpeningCandidate { id: string, name: string, email: string, eligible: boolean, reason: string | null, upcoming: number }

const contains = (term: string): string => `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

// Who the officer might put on a bar opening's slot, with the same gate the assignment applies:
// bar training, and one slot per person per opening (0250, E-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'rota.write')
  const { search } = await getValidatedQueryOrThrow(event, query)

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const moduleId = (await shiftRoleRules(event)).BAR
  const today = londonToday()
  const tonight = showNightOpensAt(currentShowNight())

  const onOpening = sql`EXISTS (
    SELECT 1 FROM bar_opening_shifts other
    WHERE other.opening_id = ${held.openingId} AND other.id <> ${id}
      AND other.user_id = cand.id AND other.status IN ('CLAIMED', 'CONFIRMED')
  )`
  const columns = sql`cand.id AS id, cand.name AS name, cand.email AS email, ${onOpening} AS onOpening,
    ${upcomingLoad(sql`cand.id`, tonight)} AS upcoming`

  type Row = { id: string, name: string, email: string, onOpening: number, upcoming: number }
  // Nothing typed: the bar-trained people with the fewest shifts ahead, so the rota spreads (0251).
  const matched = search === ''
    ? moduleId === null
      ? []
      : await db.all<Row>(sql`
        SELECT ${columns}
        FROM users cand
        WHERE cand.anonymised_at IS NULL AND cand.disabled = 0
          AND ${holdsModuleNow(sql`cand.id`, moduleId, today)} AND NOT ${onOpening}
        ORDER BY upcoming, cand.name COLLATE NOCASE
        LIMIT ${SUGGESTION_LIMIT}
      `)
    : await db.all<Row>(sql`
        SELECT ${columns}
        FROM users cand
        WHERE cand.anonymised_at IS NULL AND cand.disabled = 0
          AND (lower(cand.name) LIKE ${contains(search.toLowerCase())} ESCAPE '\\' OR lower(cand.email) LIKE ${contains(search.toLowerCase())} ESCAPE '\\')
        ORDER BY cand.name COLLATE NOCASE
        LIMIT 10
      `)

  const moduleName = moduleId === null ? null : (await gatingModules([moduleId])).get(moduleId)?.name ?? null
  const items: OpeningCandidate[] = await Promise.all(matched.map(async ({ onOpening, ...row }) => {
    const gate = candidateLock({ role: 'BAR', moduleId, moduleName, held: await modulesHeldBy(row.id, today), committee: true, onPerformance: false })
    const reason = gate ?? (onOpening === 1 ? ALREADY_ON_OPENING : null)
    return { ...row, eligible: reason === null, reason }
  }))

  return { items, suggested: search === '' }
})
