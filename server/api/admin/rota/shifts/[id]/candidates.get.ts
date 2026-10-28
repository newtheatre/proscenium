import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { ALREADY_ON_PERFORMANCE, candidateLock, needsCommitteeRole } from '#shared/utils/rota-eligibility'
import { currentShowNight, showNightOpensAt } from '#shared/utils/show-night'

const query = z.object({ search: z.string().trim().max(200).default('') })

// `movable`: locked only by another shift on this performance, which an assignment can move them off (0211).
// `upcoming`: shifts and opening slots they already hold from tonight on (0251).
export interface AssignCandidate { id: string, name: string, email: string, eligible: boolean, reason: string | null, movable: boolean, upcoming: number }

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
  if (!held) throw noSuch('shift')

  const rules = await shiftRoleRules(event)
  const moduleId = rules[held.role]
  const today = londonToday()
  const tonight = showNightOpensAt(currentShowNight())
  const now = Math.floor(Date.now() / 1000)

  // The assignment refuses anybody already holding another shift on the performance, so this says so.
  const onPerformance = sql`EXISTS (
    SELECT 1 FROM shifts other
    WHERE other.performance_id = ${held.performanceId} AND other.id <> ${id}
      AND other.user_id = cand.id AND other.status IN ('CLAIMED', 'CONFIRMED')
  )`
  const clashes = clashesWith(sql`cand.id`, sql`(SELECT starts_at FROM shifts WHERE id = ${id})`, sql`(SELECT ends_at FROM shifts WHERE id = ${id})`, sql`${held.venueId}`)
  const columns = sql`cand.id AS id, cand.name AS name, cand.email AS email, ${onPerformance} AS onPerformance,
    ${clashes} AS clashes, ${upcomingLoad(sql`cand.id`, tonight)} AS upcoming`

  type Row = { id: string, name: string, email: string, onPerformance: number, clashes: number, upcoming: number }
  // Nothing typed: the eligible people with the fewest shifts ahead, so the rota spreads (0251).
  // An unnamed rule suggests nobody, the way it admits nobody (E-103 criterion 4).
  const matched = search === ''
    ? moduleId === null
      ? []
      : await db.all<Row>(sql`
        SELECT ${columns}
        FROM users cand
        WHERE cand.anonymised_at IS NULL AND cand.disabled = 0
          AND ${holdsModuleNow(sql`cand.id`, moduleId, today)}
          AND ${needsCommitteeRole(held.role) ? holdsCommitteeRole(sql`cand.id`, now) : sql`1`}
          AND NOT ${onPerformance} AND NOT ${clashes}
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
  // A duty manager also needs a live committee role, which the assignment's write reads too (0115).
  const items: AssignCandidate[] = await Promise.all(matched.map(async ({ onPerformance, clashes, ...row }) => {
    const [heldModules, committee] = await Promise.all([modulesHeldBy(row.id, today), needsCommitteeRole(held.role) ? hasCommitteeRole(row.id) : true])
    const facts = { role: held.role, moduleId, moduleName, held: heldModules, committee, onPerformance: onPerformance === 1, clashes: clashes === 1 }
    const reason = candidateLock(facts)
    const movable = reason === ALREADY_ON_PERFORMANCE && candidateLock({ ...facts, onPerformance: false }) === null
    return { ...row, eligible: reason === null, reason, movable }
  }))

  return { items, suggested: search === '' }
})
