import { describe, expect, test } from 'bun:test'
import { saysSetUp, setUpHref, setUpLines } from '#shared/utils/console-overview'
import { saysMembershipSource } from '#shared/utils/membership'
import { oneRowPerRole } from '#shared/utils/my-rota'
import { saysStamped } from '#shared/utils/rota'
import { ageCheckVenue } from '#shared/utils/age-checks'
import { sessionForm } from '#shared/utils/training'

// The rota, training, safety, people, comms and admin findings of the hands-on review of 13 October
// 2026, each pinned where the screen or the shared helper carries it.

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('a training request is declined in those words (G-104 criterion 3)', () => {
  test('the board offers Decline, never an Answer that turns out to be one', async () => {
    const source = await read('app/pages/training/manage/requests.vue')
    expect(source).toContain('() => \'Decline\'')
    expect(source).not.toContain('() => \'Answer\'')
    expect(source).toContain('title="Decline this request"')
  })
})

describe('a prerequisite members cannot open is named, never linked (G-103 criteria 2 and 4)', () => {
  test('the module page links a prerequisite only when it is listed', async () => {
    const source = await read('app/pages/training/modules/[id].vue')
    expect(source).toContain('v-if="need.listed"')
    expect(source).toContain('data-test="module-need-unlisted"')
  })

  test('both member catalogues say whether each prerequisite is listed', async () => {
    for (const path of ['server/api/training/catalogue.get.ts', 'server/api/training/modules.get.ts']) {
      expect(await read(path)).toContain('listed: edge.requiresStatus === \'ACTIVE\'')
    }
  })
})

describe('a session is scheduled for a future day (G-112 criterion 1)', () => {
  test('the day picker starts tomorrow, as the write path does', async () => {
    const source = await read('app/pages/training/manage/sessions/index.vue')
    expect(source).toContain(':min="tomorrow"')
  })

  test('an empty day asks for one rather than quoting a format', () => {
    const parsed = sessionForm.safeParse({ heldOn: '', startsAt: '19:00', endsAt: '21:00', capacity: 12, moduleIds: ['SFTY-001'] })
    expect(parsed.success).toBe(false)
    const messages = parsed.error!.issues.filter(issue => issue.path[0] === 'heldOn').map(issue => issue.message)
    expect(messages[0]).toBe('Choose the day it is held')
  })
})

describe('the member rota', () => {
  test('a claim already on its way is not sent twice', async () => {
    const source = await read('app/pages/rota/index.vue')
    expect(source.match(/if \(claiming\.value\) return/g)?.length).toBe(3)
  })

  test('a release names the show and the night it gives back', async () => {
    const source = await read('app/pages/rota/index.vue')
    expect(source).toContain('says: `${saysShiftRole(shift.role)} for ${shift.showTitle}, ${saysWhenLong(shift.startsAt)}`')
    expect(source).toContain('says: `${slot.label} at ${slot.venueName}, ${saysWhenLong(slot.startsAt)}`')
  })

  test('identical open places on one performance read as one row, with how many', () => {
    const door = (shiftId: string, performanceId = 'p-1') => ({ shiftId, performanceId, role: 'DOOR' as const, startsAt: 1 })
    const rows = oneRowPerRole([door('a'), door('b'), { ...door('c'), role: 'BAR' as const }, door('d', 'p-2')])
    expect(rows.map(row => [row.shiftId, row.places])).toEqual([['a', 2], ['c', 1], ['d', 1]])
  })

  test('the list draws the grouped rows and says how many places', async () => {
    const source = await read('app/pages/rota/index.vue')
    expect(source).toContain('oneRowPerRole(group.items)')
    expect(source).toContain('data-test="open-shift-places"')
  })

  test('a role whose only session is full says so beside the waiting list', async () => {
    expect(await read('app/components/training/ModuleAction.vue')).toContain('which is full')
  })
})

describe('stamping the diary', () => {
  test('it asks first', async () => {
    const source = await read('app/pages/rota/manage/templates.vue')
    expect(source).toContain('name="stamp-diary"')
    expect(source).toContain('\'onClick\': () => askToStamp(row.original)')
  })

  test('what it did is said once, without contradicting itself', () => {
    expect(saysStamped({ stamped: 0, filled: 0 })).toEqual({ title: 'Nothing to add', description: 'Every performance from tonight onwards already has its slots and their times.' })
    expect(saysStamped({ stamped: 0, filled: 69 }).title).toBe('Times added to 69 shifts')
    expect(saysStamped({ stamped: 0, filled: 69 }).description).not.toContain('Nothing')
    expect(saysStamped({ stamped: 3, filled: 0 }).title).toBe('3 shifts added')
    expect(saysStamped({ stamped: 1, filled: 2 }).description).toContain('2 shifts gained the times')
  })
})

describe('the Challenge 25 register (E-118, E-119)', () => {
  test('the screen lists the range it would export, read in London', async () => {
    const source = await read('app/pages/rota/manage/age-checks.vue')
    expect(source).toContain('/api/admin/age-checks')
    expect(source).toContain('data-test="register-table"')
    expect(source).toContain('londonDay(new Date())')
    expect(source).not.toContain('toISOString')
  })

  test('an entry with no performance names where it was taken, in the CSV as on the PDF', async () => {
    expect(ageCheckVenue(null)).toBe('Bar (no performance)')
    expect(ageCheckVenue('The Studio')).toBe('The Studio')
    const route = await read('server/api/admin/age-checks/export.get.ts')
    expect(route).toContain('venue: ageCheckVenue(row.venueName)')
  })
})

describe('the rota board says which nights it shows without opening Filters', () => {
  test('the window is in view beside the toolbar', async () => {
    expect(await read('app/pages/rota/manage/shifts.vue')).toContain('data-test="board-span"')
  })
})

describe('safety routing that reaches nobody is said (E-116)', () => {
  test('a set-up line opens the safety screen when no severity routes', () => {
    const lines = setUpLines({ anySeverityRoutes: false })
    expect(lines).toEqual([{ kind: 'NO_SAFETY_ROUTING' }])
    expect(saysSetUp(lines[0]!)).toBe('No incident severity routes to follow-up, so a serious incident reaches nobody.')
    expect(setUpHref(lines[0]!)).toBe('/rota/manage/safety')
    expect(setUpLines({ anySeverityRoutes: true })).toEqual([])
  })

  test('the safety screen warns, and each switch names its severity', async () => {
    const source = await read('app/pages/rota/manage/safety.vue')
    expect(source).toContain('data-test="routing-off"')
    expect(source).toContain('\'aria-label\': `${saysSeverity(row.original.severity)} routes to follow-up`')
  })
})

describe('people and admin polish', () => {
  test('a membership source reads in words', async () => {
    expect(saysMembershipSource('ROSTER')).toBe('SU roster')
    expect(saysMembershipSource('MANUAL')).toBe('Recorded by hand')
    expect(saysMembershipSource('MANUAL', true)).toBe('From a claim')
    expect(await read('app/pages/people/members.vue')).toContain('saysMembershipSource(row.original.source, row.original.fromClaim === 1)')
  })

  test('a role line keeps the space before until', async () => {
    expect(await read('app/pages/people/accounts/[id].vue')).toContain('<span>{{ saysRole(grant.role) }}</span>{{ \' \' }}')
  })

  test('the dev sign-in stamps last seen, as every real sign-in does', async () => {
    expect(await read('server/api/dev/sign-in-as.post.ts')).toContain('lastLoginAt')
  })

  test('a refused setting says why beside the field and keeps saying it', async () => {
    const source = await read('app/pages/admin/settings.vue')
    expect(source).toContain('errors[setting.key] = refusalText(error)')
    expect(source).toContain(':data-test="`refused-${setting.key}`"')
  })

  test('the announcement subject is as wide as the message', async () => {
    expect(await read('app/pages/comms/announce.vue')).toMatch(/v-model="subject"\s+data-test="announce-subject"\s+class="w-full"/)
  })

  test('the send log names its days as days', async () => {
    expect(await read('app/pages/comms/operations/index.vue')).toContain('saysDay(row.original.day)')
  })

  test('a My NNT tile keeps its content at the top however tall the row', async () => {
    expect(await read('app/components/my/Tile.vue')).toContain('container: \'h-full lg:flex\'')
  })
})
