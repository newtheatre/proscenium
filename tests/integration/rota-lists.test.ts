import { describe, expect, test } from 'bun:test'
import { filterQuerySchema, operatorsOf } from '#shared/utils/list-filters'
import { checklistVenuesList } from '#shared/utils/checklist-venues-list'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'
import { rotaApprovalsList } from '#shared/utils/rota-approvals-list'
import { rotaTemplatesList } from '#shared/utils/rota-templates-list'
import { SHIFT_ROLES } from '#shared/utils/rota'
import { unfilledShiftsList } from '#shared/utils/unfilled-shifts-list'
import {
  countPendingApprovalsQuery,
  countUnfilledShiftsQuery,
  pendingApprovalsClause,
  pendingApprovalsQuery,
  replaceTemplateStatements,
  unfilledShiftsClause,
  unfilledShiftsQuery,
  venueTemplatesClause,
  venueTemplatesQuery,
} from '#server/utils/rota'
import { checklistVenuesClause, insertItemStatement, venueChecklistsQuery } from '#server/utils/checklist'
import { currentCardsQuery, emergencyCardsClause, recordCardStatement } from '#server/utils/venue-emergency'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { EmergencyCardInput } from '#shared/utils/venue-emergency'
import type { FilterField } from '#shared/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The rota module's five console lists, each through its own declaration (K-129 criteria 1, 5
// and 6). "Night" is the mechanism's own extension (0014): server/utils/list-filters.ts.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: ReturnType<typeof unfilledShiftsQuery>): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): void {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
}

function shift(database: TestDatabase, id: string, performanceId: string, role: string, options: { slot?: number, status?: string, userId?: string } = {}): void {
  const status = options.status ?? 'OPEN'
  let userId: string | null = null
  // A status other than OPEN names somebody, or the CHECK the schema holds refuses the row.
  if (status !== 'OPEN') {
    // Lower-cased: the email built from it must pass `users_email_lowercase`, and a shift id
    // carries its role in capitals.
    userId = options.userId ?? `${id.toLowerCase()}-holder`
    person(database, userId)
  }
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status, user_id) VALUES (?, ?, ?, ?, ?, ?)',
    id, performanceId, role, options.slot ?? 1, status, userId]])
}

function claimedShift(database: TestDatabase, id: string, performanceId: string, role: string, userId: string): void {
  database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status, user_id, claimed_at) VALUES (?, ?, ?, 1, ?, ?, unixepoch())',
    id, performanceId, role, 'CLAIMED', userId]])
}

const unfilledSchema = filterQuerySchema(unfilledShiftsList)
const parseUnfilled = (raw: Record<string, string>) => {
  const result = unfilledSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

const approvalsSchema = filterQuerySchema(rotaApprovalsList)
const parseApprovals = (raw: Record<string, string>) => {
  const result = approvalsSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

const templatesSchema = filterQuerySchema(rotaTemplatesList)
const parseTemplates = (raw: Record<string, string>) => {
  const result = templatesSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

const checklistSchema = filterQuerySchema(checklistVenuesList)
const parseChecklist = (raw: Record<string, string>) => {
  const result = checklistSchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

const emergencySchema = filterQuerySchema(emergencyCardsList)
const parseEmergency = (raw: Record<string, string>) => {
  const result = emergencySchema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

describe('unfilled shifts (E-107, K-129)', () => {
  test('every field the declaration names is answered', async () => {
    await withDatabase((database) => {
      const now = Math.floor(Date.now() / 1000)
      const house = tonightsPerformance(database, { suffix: 'unfilled-answered' })
      shift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR')

      for (const field of unfilledShiftsList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const value = field.kind === 'yes-no' ? 'true' : (field.options?.[0]?.value ?? '2026-01-01')
          const raw = operator === 'empty' ? 'empty' : operator === 'between' ? `between:${value},${value}` : `${operator}:${value}`
          const clause = unfilledShiftsClause(parseUnfilled({ [field.key]: raw }), now)
          expect(() => run(database, unfilledShiftsQuery(clause, 25, 0))).not.toThrow()
        }
      }
    })
  })

  test('a role filters to just that role', async () => {
    await withDatabase((database) => {
      const now = Math.floor(Date.now() / 1000)
      const house = tonightsPerformance(database, { suffix: 'unfilled-role' })
      shift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR')
      shift(database, `${house.performanceId}-BAR-1`, house.performanceId, 'BAR')

      const clause = unfilledShiftsClause(parseUnfilled({ role: 'is:DOOR' }), now)
      const found = run(database, unfilledShiftsQuery(clause, 25, 0)) as { role: string }[]
      expect(found.map(row => row.role)).toEqual(['DOOR'])
    })
  })

  test('an any-of role list binds one parameter per role, never per shift (0006)', async () => {
    await withDatabase((database) => {
      const now = Math.floor(Date.now() / 1000)
      const house = tonightsPerformance(database, { suffix: 'unfilled-any' })
      for (let index = 0; index < 5; index += 1) shift(database, `${house.performanceId}-BAR-${index + 1}`, house.performanceId, 'BAR', { slot: index + 1 })

      const clause = unfilledShiftsClause(parseUnfilled({ role: `any:${SHIFT_ROLES.join(',')}` }), now)
      const [, ...parameters] = boundStatement(database, clause.where!)
      expect(parameters.filter(one => (SHIFT_ROLES as readonly string[]).includes(String(one)))).toHaveLength(SHIFT_ROLES.length)
    })
  })

  test('sorting is by a declared field only', async () => {
    await withDatabase((database) => {
      expect(unfilledSchema.safeParse({ sort: 'venueName' }).success).toBe(false)
      // 0 rather than the real clock: the fixture's night is today's, and the clock may already
      // be past its early slot by the time this suite runs.
      const now = 0
      const early = tonightsPerformance(database, { suffix: 'unfilled-sort-early', curtainHoursAfterNightStart: 1 })
      const late = tonightsPerformance(database, { suffix: 'unfilled-sort-late', curtainHoursAfterNightStart: 20 })
      shift(database, `${early.performanceId}-DOOR-1`, early.performanceId, 'DOOR')
      shift(database, `${late.performanceId}-DOOR-1`, late.performanceId, 'DOOR')

      const ascending = unfilledShiftsClause(parseUnfilled({}), now)
      expect((run(database, unfilledShiftsQuery(ascending, 25, 0)) as { shiftId: string }[]).map(row => row.shiftId))
        .toEqual([`${early.performanceId}-DOOR-1`, `${late.performanceId}-DOOR-1`])

      const descending = unfilledShiftsClause(parseUnfilled({ direction: 'desc' }), now)
      expect((run(database, unfilledShiftsQuery(descending, 25, 0)) as { shiftId: string }[]).map(row => row.shiftId))
        .toEqual([`${late.performanceId}-DOOR-1`, `${early.performanceId}-DOOR-1`])
    })
  })

  test('the night filter is the show night, 04:00 to 04:00, not the calendar day (0014)', async () => {
    await withDatabase((database) => {
      const now = 0
      // 23 hours after the night starts: 03:00 London the morning after, still inside the same
      // night, though its wall-clock date is the following calendar day.
      const house = tonightsPerformance(database, { suffix: 'unfilled-night', night: '2026-09-10', curtainHoursAfterNightStart: 23 })
      shift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR')

      const onItsNight = unfilledShiftsClause(parseUnfilled({ night: 'is:2026-09-10' }), now)
      expect(run(database, unfilledShiftsQuery(onItsNight, 25, 0))).toHaveLength(1)

      // The calendar day its clock time falls on: the night filter must not agree, or a night
      // boundary would be the calendar-day one this mechanism refuses to be (0014).
      const onTheCalendarDayItFallsOn = unfilledShiftsClause(parseUnfilled({ night: 'is:2026-09-11' }), now)
      expect(run(database, unfilledShiftsQuery(onTheCalendarDayItFallsOn, 25, 0))).toHaveLength(0)
    })
  })

  test('open and declined list, and a confirmed one does not, whatever else is asked', async () => {
    await withDatabase((database) => {
      const now = Math.floor(Date.now() / 1000)
      const house = tonightsPerformance(database, { suffix: 'unfilled-status' })
      shift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR', { status: 'OPEN' })
      shift(database, `${house.performanceId}-BAR-1`, house.performanceId, 'BAR', { status: 'DECLINED' })
      shift(database, `${house.performanceId}-DUTY_MANAGER-1`, house.performanceId, 'DUTY_MANAGER', { status: 'CONFIRMED' })

      const clause = unfilledShiftsClause(parseUnfilled({}), now)
      const found = run(database, unfilledShiftsQuery(clause, 25, 0)) as { role: string }[]
      expect(found.map(row => row.role).sort()).toEqual(['BAR', 'DOOR'])
      const [total] = run(database, countUnfilledShiftsQuery(clause)) as { total: number }[]
      expect(total?.total).toBe(2)
    })
  })
})

describe('pending approvals (E-105, K-129)', () => {
  test('every field the declaration names is answered', async () => {
    await withDatabase((database) => {
      const claimant = 'approvals-answered'
      person(database, claimant)
      const house = tonightsPerformance(database, { suffix: 'approvals-answered' })
      claimedShift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR', claimant)

      for (const field of rotaApprovalsList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const value = field.options?.[0]?.value ?? '2026-01-01'
          const raw = operator === 'empty' ? 'empty' : operator === 'between' ? `between:${value},${value}` : `${operator}:${value}`
          const clause = pendingApprovalsClause(parseApprovals({ [field.key]: raw }))
          expect(() => run(database, pendingApprovalsQuery(clause, 25, 0))).not.toThrow()
        }
      }
    })
  })

  test('search covers the claimant and the show', async () => {
    await withDatabase((database) => {
      person(database, 'ivy')
      const house = tonightsPerformance(database, { suffix: 'approvals-search' })
      database.batch([['UPDATE users SET name = ? WHERE id = ?', 'Ivy Approver', 'ivy']])
      claimedShift(database, `${house.performanceId}-DOOR-1`, house.performanceId, 'DOOR', 'ivy')

      const clause = pendingApprovalsClause(parseApprovals({ search: 'Ivy' }))
      expect(run(database, pendingApprovalsQuery(clause, 25, 0))).toHaveLength(1)
      const miss = pendingApprovalsClause(parseApprovals({ search: 'Nobody' }))
      expect(run(database, pendingApprovalsQuery(miss, 25, 0))).toHaveLength(0)
    })
  })

  test('only claimed shifts wait, whatever else is asked', async () => {
    await withDatabase((database) => {
      person(database, 'jo')
      const claimedHouse = tonightsPerformance(database, { suffix: 'approvals-claimed' })
      const openHouse = tonightsPerformance(database, { suffix: 'approvals-open' })
      claimedShift(database, `${claimedHouse.performanceId}-DOOR-1`, claimedHouse.performanceId, 'DOOR', 'jo')
      shift(database, `${openHouse.performanceId}-DOOR-1`, openHouse.performanceId, 'DOOR', { status: 'OPEN' })

      const clause = pendingApprovalsClause(parseApprovals({}))
      expect(run(database, pendingApprovalsQuery(clause, 25, 0))).toHaveLength(1)
      const [total] = run(database, countPendingApprovalsQuery(clause)) as { total: number }[]
      expect(total?.total).toBe(1)
    })
  })
})

describe('shift templates (E-101, K-129)', () => {
  test('every field the declaration names is answered', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'templates-answered' })
      person(database, 'actor')
      for (const statement of replaceTemplateStatements(venue.id, [{ role: 'DOOR', count: 1 }], 'actor')) run(database, statement)

      for (const field of rotaTemplatesList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const raw = operator === 'empty' ? 'empty' : 'true'
          const clause = venueTemplatesClause(parseTemplates({ [field.key]: raw }))
          expect(() => run(database, venueTemplatesQuery(clause, 25, 0))).not.toThrow()
        }
      }
    })
  })

  test('"staffed" is a venue with a slot, not a column', async () => {
    await withDatabase((database) => {
      const staffed = testVenue(database, { suffix: 'templates-staffed' })
      const bare = testVenue(database, { suffix: 'templates-bare' })
      person(database, 'actor')
      for (const statement of replaceTemplateStatements(staffed.id, [{ role: 'DOOR', count: 1 }], 'actor')) run(database, statement)

      const staffedOnly = venueTemplatesClause(parseTemplates({ staffed: 'true' }))
      const staffedVenues = run(database, venueTemplatesQuery(staffedOnly, 25, 0)) as { venueId: string }[]
      expect(staffedVenues.map(venue => venue.venueId)).toEqual([staffed.id])

      const bareOnly = venueTemplatesClause(parseTemplates({ staffed: 'false' }))
      const bareVenues = run(database, venueTemplatesQuery(bareOnly, 25, 0)) as { venueId: string }[]
      expect(bareVenues.map(venue => venue.venueId)).toContain(bare.id)
      expect(bareVenues.map(venue => venue.venueId)).not.toContain(staffed.id)
    })
  })

  test('sorting is by a declared field only, and paging scopes by a subquery (0006)', async () => {
    await withDatabase((database) => {
      expect(templatesSchema.safeParse({ sort: 'staffed' }).success).toBe(false)
      testVenue(database, { suffix: 'templates-sort-b', name: 'Beta House' })
      testVenue(database, { suffix: 'templates-sort-a', name: 'Alpha House' })

      const clause = venueTemplatesClause(parseTemplates({}))
      const named = run(database, venueTemplatesQuery(clause, 25, 0)) as { venueName: string }[]
      const names = named.map(venue => venue.venueName)
      expect(names.indexOf('Alpha House')).toBeLessThan(names.indexOf('Beta House'))
    })
  })
})

describe('checklist venues (E-114, K-129)', () => {
  test('every field the declaration names is answered', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'checklist-answered' })
      person(database, 'actor')
      run(database, insertItemStatement({ venueId: venue.id, phase: 'PRE', label: 'Fire exits checked', sort: 1, required: true, systemCheck: null }, 'actor', 'item-answered'))

      for (const field of checklistVenuesList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const raw = operator === 'empty' ? 'empty' : 'true'
          const clause = checklistVenuesClause(parseChecklist({ [field.key]: raw }))
          expect(() => run(database, venueChecklistsQuery(clause, 25, 0))).not.toThrow()
        }
      }
    })
  })

  test('"configured" is a venue with an active item, not a column', async () => {
    await withDatabase((database) => {
      const configured = testVenue(database, { suffix: 'checklist-configured' })
      const bare = testVenue(database, { suffix: 'checklist-bare' })
      person(database, 'actor')
      run(database, insertItemStatement({ venueId: configured.id, phase: 'PRE', label: 'Fire exits checked', sort: 1, required: true, systemCheck: null }, 'actor', 'item-configured'))

      const configuredOnly = checklistVenuesClause(parseChecklist({ configured: 'true' }))
      const found = run(database, venueChecklistsQuery(configuredOnly, 25, 0)) as { venueId: string }[]
      expect(found.map(venue => venue.venueId)).toEqual([configured.id])
      expect(found.map(venue => venue.venueId)).not.toContain(bare.id)
    })
  })
})

// Every field the card carries, so adding one to the form is a change here and not a silent
// hole in a fixture (E-113 criterion 1).
const emergencyCard = (overrides: Partial<EmergencyCardInput> = {}): EmergencyCardInput => ({
  address: 'The Nottingham New Theatre, Nottingham NG7 2RD',
  assemblyPoint: null,
  exits: null,
  isolationPoints: null,
  firstAidKit: null,
  defibrillator: null,
  firstAiders: null,
  firePanel: null,
  what3words: null,
  notes: null,
  ...overrides,
})

describe('emergency cards (E-113, K-129)', () => {
  test('every field the declaration names is answered', async () => {
    await withDatabase((database) => {
      const officer = 'emergency-answered-officer'
      person(database, officer)
      const venue = testVenue(database, { suffix: 'emergency-answered' })
      run(database, recordCardStatement(venue.id, emergencyCard({ assemblyPoint: 'x' }), officer, 'card-answered').statement)

      for (const field of emergencyCardsList.fields as readonly FilterField[]) {
        for (const operator of operatorsOf(field)) {
          const raw = operator === 'empty' ? 'empty' : 'true'
          const clause = emergencyCardsClause(parseEmergency({ [field.key]: raw }))
          expect(() => run(database, currentCardsQuery(clause, 25, 0))).not.toThrow()
        }
      }
    })
  })

  test('"filed" is a venue with a version on record, not a column', async () => {
    await withDatabase((database) => {
      const officer = 'emergency-filed-officer'
      person(database, officer)
      const filed = testVenue(database, { suffix: 'emergency-filed' })
      const bare = testVenue(database, { suffix: 'emergency-bare' })
      run(database, recordCardStatement(filed.id, emergencyCard({ assemblyPoint: 'The car park' }), officer, 'card-filed').statement)

      const filedOnly = emergencyCardsClause(parseEmergency({ filed: 'true' }))
      const found = run(database, currentCardsQuery(filedOnly, 25, 0)) as { venueId: string }[]
      expect(found.map(venue => venue.venueId)).toEqual([filed.id])
      expect(found.map(venue => venue.venueId)).not.toContain(bare.id)
    })
  })
})
