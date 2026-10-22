import { describe, expect, test } from 'bun:test'
import { queuesFor, saysSetUp, setUpHref, setUpLines, tonightLines } from '#shared/utils/console-overview'
import { PERMISSION_MAP } from '#shared/utils/roles'
import type { Permission, Role } from '#shared/utils/roles'
import type { RoleEligibility } from '#shared/utils/rota-readiness'

// The console overview (issue 1358, K-108 criterion 3, A-130 criterion 8): what is waiting for the
// viewer, what set-up is unfinished, tonight, and the overdue drill, each only for who can act on it.

const holding = (...roles: Role[]): Set<Permission> => new Set(roles.flatMap(role => PERMISSION_MAP[role]))

const OVERVIEW = 'app/pages/admin/index.vue'
const NAV_COUNTS_COMPOSABLE = 'app/composables/useNavCounts.ts'
const read = (path: string): Promise<string> => Bun.file(path).text()

describe('a queue is offered to whoever decides it', () => {
  test('each officer is given the queues their role works, and nobody else\'s', () => {
    expect(queuesFor(holding('SECRETARY'), false)).toEqual(['access-profiles'])
    expect(queuesFor(holding('PRESIDENT', 'TREASURER', 'COMMITTEE'), false)).toEqual([])
    expect(queuesFor(holding('FOH_MANAGER'), false)).toEqual(['pass-requests'])
    expect(queuesFor(holding('ADMIN'), false)).toEqual(['membership-claims', 'access-profiles', 'room-requests', 'training-requests', 'pass-requests'])
  })

  test('a department lead answers training requests without the Theatre Manager\'s grant', () => {
    expect(queuesFor(new Set(), true)).toEqual(['training-requests'])
    expect(queuesFor(new Set(), false)).toEqual([])
  })

  // The Theatre Manager reads the register and the rooms without deciding a claim.
  test('reading a register is not deciding its queue', () => {
    expect(queuesFor(holding('THEATRE_MANAGER'), false)).toEqual(['room-requests', 'training-requests'])
    expect(queuesFor(new Set<Permission>(['members.read', 'ticketing.read']), false)).toEqual([])
  })
})

const UNSET_DOOR: RoleEligibility = { role: 'DOOR', moduleId: null, moduleName: null, standing: 'UNSET' }
const SET_BAR: RoleEligibility = { role: 'BAR', moduleId: 'ADMN-102', moduleName: 'Selling alcohol', standing: 'SET' }

describe('set-up still to do', () => {
  test('a fact nobody was asked about is never a line', () => {
    expect(setUpLines({})).toEqual([])
  })

  test('each unfinished piece is one line, and a finished one is none', () => {
    expect(setUpLines({ eligibility: [UNSET_DOOR, SET_BAR], anythingOnHand: false, anyStocktake: false, allergensUnknown: 3 })).toEqual([
      { kind: 'ELIGIBILITY', eligibility: UNSET_DOOR },
      { kind: 'NOTHING_ON_HAND' },
      { kind: 'NO_STOCKTAKE' },
      { kind: 'ALLERGENS_UNKNOWN', items: 3 },
    ])
    expect(setUpLines({ eligibility: [SET_BAR], anythingOnHand: true, anyStocktake: true, allergensUnknown: 0 })).toEqual([])
  })

  test('each line says what is missing in words and opens the screen that finishes it', () => {
    const lines = setUpLines({ eligibility: [UNSET_DOOR], anythingOnHand: false, anyStocktake: false, allergensUnknown: 1 })
    expect(lines.map(saysSetUp)).toEqual([
      'No module named yet, so nobody can claim a door shift.',
      // Says the fact tested: a delivery since sold out also leaves nothing on hand.
      'Nothing is on hand at the bar: record a delivery or an opening count.',
      'No stocktake has been applied yet, so on-hand is what deliveries and sales say, not a count.',
      '1 stocked item has no allergen answer.',
    ])
    expect(lines.map(setUpHref)).toEqual(['/rota/manage/templates', '/bar/stock', '/bar/stock/stocktakes', '/bar/stock/allergens'])
    expect(saysSetUp({ kind: 'ALLERGENS_UNKNOWN', items: 4 })).toBe('4 stocked items have no allergen answer.')
  })
})

// 0210: out of the box nobody holds both a duty manager needs, and the console says so.
describe('a named module nobody can meet is still set-up to do', () => {
  const SET_DM: RoleEligibility = { role: 'DUTY_MANAGER', moduleId: 'ADMN-201', moduleName: 'Committee Operations', standing: 'SET' }

  test('a role nobody qualifies for is a line, and one somebody does is none', () => {
    expect(setUpLines({ eligibility: [SET_DM, SET_BAR], qualified: { DUTY_MANAGER: 0, BAR: 2 } })).toEqual([
      { kind: 'NOBODY_QUALIFIES', eligibility: SET_DM },
    ])
  })

  test('without counts, nothing is assumed', () => {
    expect(setUpLines({ eligibility: [SET_DM] })).toEqual([])
  })

  test('the line says what both halves are and how to meet them', () => {
    const [line] = setUpLines({ eligibility: [SET_DM], qualified: { DUTY_MANAGER: 0 } })
    expect(saysSetUp(line!)).toContain('nobody holds both ADMN-201 and a committee role')
    expect(setUpHref(line!)).toBe('/rota/manage/templates')
  })
})

describe('tonight, for whoever may open its screens', () => {
  test('a cancelled performance is not on tonight', () => {
    const lines = tonightLines([
      { id: 'p-1', showTitle: 'The Tempest', venueName: 'Main', startsAt: 1_790_000_000, status: 'ON_SALE' },
      { id: 'p-2', showTitle: 'Cancelled thing', venueName: 'Studio', startsAt: 1_790_000_100, status: 'CANCELLED' },
    ])
    expect(lines).toEqual([{ performanceId: 'p-1', showTitle: 'The Tempest', venueName: 'Main', startsAt: 1_790_000_000 }])
  })
})

describe('the overview screen', () => {
  test('it lists what is waiting, what is unfinished, tonight and the drill, and no placeholder', async () => {
    const source = await read(OVERVIEW)
    for (const hook of ['waiting-for-you', 'waiting-failed', 'set-up-to-do', 'tonight-card', 'drill-overdue', 'drill-failed']) {
      expect(source).toContain(`data-test="${hook}"`)
    }
    expect(source).toContain('NAV_QUEUES[')
    expect(source).toContain('/api/admin/overview')
    expect(source).not.toContain('The rest of this screen arrives')
  })

  // A viewer who decides no queue is not shown a failure about queues they do not have.
  test('a failed count is said only to somebody who decides a queue', async () => {
    const source = await read(OVERVIEW)
    expect(source).toContain('queuesFor(')
    expect(source).toMatch(/v-if="waiting\.length > 0 \|\| \(waitingOwn && decidesAny\)"/)
  })

  // A refused or failed read is not "nothing has failed" (issue 1358).
  test('messages that did not arrive say their outcome in the send log\'s words, and a failed read says so', async () => {
    const source = await read(OVERVIEW)
    expect(source).toContain('saysNotificationStatus(')
    expect(source).not.toContain('Spoken for')
    expect(source).toContain('data-test="trouble-failed"')
    expect(source).toContain('/comms/operations/accounts/')
  })

  test('the sidebar and the overview read one count of each queue', async () => {
    expect(await read(NAV_COUNTS_COMPOSABLE)).toContain('/api/admin/waiting')
  })

  // A-130 criterion 11: deciding one moves the sidebar's count at once, not on the next screen.
  test('each screen that works a counted queue refreshes the count after a decision', async () => {
    for (const path of ['app/pages/rooms/manage/requests.vue', 'app/pages/training/manage/requests.vue', 'app/pages/box-office/desk-passes.vue']) {
      const source = await read(path)
      expect(source).toContain('useNavCounts()')
      expect(source).toContain('nav.refresh()')
    }
  })
})
