import { sql } from 'drizzle-orm'
import { holdsCommitteeRole } from '#server/utils/committee-standing'
import { staffingStanding } from '#shared/utils/person-view'
import type { MyOpeningShiftRow } from '#server/utils/bar-openings'
import type { MyShiftRow } from '#server/utils/rota'
import type { PersonRoleLine } from '#shared/utils/person-view'

// One person's rota standing for the account page: each role they could or could not be put on,
// and why, with their own shifts from tonight on (0255). Reads only, so it writes no audit row.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')
  const id = getRouterParam(event, 'id') ?? ''

  const account = await findById(id)
  if (!account || account.anonymisedAt !== null) throw noSuch('account')

  const now = Math.floor(Date.now() / 1000)
  const today = londonToday()
  const eligibility = await roleEligibilities(event)

  // One statement, a column a role and one for the committee role: at most four fixed tests (0006).
  const columns = eligibility.map(line => sql`${holdsGate({ moduleId: line.moduleId, today }, id)} AS ${sql.raw(line.role)}`)
  const [held] = await db.all<Record<string, number>>(sql`
    SELECT ${sql.join(columns, sql`, `)}, ${holdsCommitteeRole(id, now)} AS committee
  `)

  const roles: PersonRoleLine[] = eligibility.map((line) => {
    const holdsModule = held?.[line.role] === 1
    const holdsCommitteeRole = held?.committee === 1
    return { ...line, holdsModule, holdsCommitteeRole, staffing: staffingStanding(line, holdsModule, holdsCommitteeRole, account.disabled) }
  })

  const [shifts, openings] = await Promise.all([
    db.all<MyShiftRow>(myShiftsQuery(id, now)),
    db.all<MyOpeningShiftRow>(myOpeningShiftsQuery(id, now)),
  ])

  return { roles, shifts, openings }
})
