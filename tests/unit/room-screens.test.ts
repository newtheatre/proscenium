import { describe, expect, test } from 'bun:test'
import { tapToSpan } from '#shared/utils/rooms'

// The member's room screens: one landing, one schema per submit, and a grid a finger can use
// (C-102 criteria 6 to 8, C-105 criteria 7 and 8, C-120 criterion 7, issue 1153 item 5).

describe('picking a span by tapping (C-102 criterion 6)', () => {
  test('the first tap sets the start and picks nothing', () => {
    expect(tapToSpan(null, 600, 15)).toEqual({ start: 600, span: null })
  })

  test('the second tap closes the span at the far edge of the slot tapped', () => {
    expect(tapToSpan(600, 660, 15)).toEqual({ start: null, span: { from: 600, to: 675 } })
  })

  test('one slot tapped twice is a whole slot, not nothing', () => {
    expect(tapToSpan(600, 600, 15)).toEqual({ start: null, span: { from: 600, to: 615 } })
  })

  test('a tap before the start moves the start rather than picking backwards', () => {
    expect(tapToSpan(600, 540, 15)).toEqual({ start: 540, span: null })
  })
})

const GRID = 'app/components/RoomGrid.vue'
const CALENDAR = 'app/pages/rooms/index.vue'
const BOOK = 'app/pages/rooms/book.vue'
const EXTERNAL = 'app/pages/rooms/external.vue'
const MINE = 'app/pages/rooms/mine.vue'
const ROTA = 'app/pages/rota/index.vue'

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('the calendar grid (C-102 criteria 6 and 7, issue 1153 item 5)', () => {
  test('a slot is a touch target where the pointer is a finger', async () => {
    expect(await read(GRID)).toContain('pointer-coarse:h-11')
  })

  test('a closure says its reason on the page, not only in a tooltip', async () => {
    const source = await read(GRID)
    expect(source).toContain('data-test="grid-closures"')
    expect(source).not.toContain(':title="closureAt')
  })

  test('the legend names each state once, with no second word for one of them', async () => {
    const legend = (await read(CALENDAR)).split('<div class="mt-8 flex flex-wrap items-center gap-4')[1] ?? ''
    expect(legend).not.toContain('Shut')
  })

  test('the calendar does not send a member to the console unless they can open it', async () => {
    const source = await read(CALENDAR)
    if (source.includes('/rooms/manage')) expect(source).toContain('manageRoomsEstate')
  })
})

describe('what a submit does (C-105 criteria 7 and 8, C-120 criterion 7, issue 1153 item 5)', () => {
  test('a booking, a series and a request all land on the bookings screen', async () => {
    const source = await read(BOOK)
    expect(source).not.toContain('navigateTo(\'/rooms\')')
    expect(source.match(/navigateTo\('\/rooms\/mine'\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  // Issue 1337: the server derives a member's tier, so the form offers the choice to officers only.
  test('the tier is asked only of an officer', async () => {
    const source = await read(BOOK)
    expect(source).toContain('v-if="namesTier"')
    expect(source).toContain('manageRoomsEstate')
    expect(source).toContain('tier: undefined,')
  })

  // Issue 1338, A-129 criterion 2: a lapsed member is told before the form, with the fix.
  test('both forms refuse a lapsed member up front, in the policy\'s words, with the way to fix it', async () => {
    for (const [path, prefix] of [[BOOK, 'booking'], [EXTERNAL, 'external']] as const) {
      const source = await read(path)
      expect(source).toContain('memberOrGrace')
      expect(source).toContain(`data-test="${prefix}-needs-membership"`)
      expect(source).toContain(`data-test="${prefix}-membership-link"`)
    }
  })

  // Issue 1338, docs/copy-style.md section 8: two fields never ask one question.
  test('what the room is for is asked once, as chips, with an optional name beside it', async () => {
    for (const path of [BOOK, EXTERNAL, MINE]) {
      const source = await read(path)
      expect(source).toContain('<PurposeChips')
      expect(source).not.toContain('label="What it is for"')
      expect(source).toContain('label="A name for it"')
    }
  })

  // The change form on My bookings asks the same questions as the form that made the request.
  test('changing a request asks what for by chips, and names it through the one fallback', async () => {
    const source = await read(MINE)
    expect(source).toContain('test-prefix="edit"')
    expect(source).toContain('nameOrPurpose(')
  })

  test('the unlisted-room form names the earliest day it can be asked for', async () => {
    expect(await read(EXTERNAL)).toContain('externalEarliestDay')
  })

  test('no submit on the booking form goes round the schema', async () => {
    const source = await read(BOOK)
    expect(source).not.toContain('@click="bookSeries"')
    expect(source).not.toContain('@click="ask"')
  })

  test('the unlisted-room form is a form over a schema, with the shared time field', async () => {
    const source = await read(EXTERNAL)
    expect(source).toContain('<UForm')
    expect(source).toContain('<TimeField')
    expect(source).not.toContain('type="time"')
  })
})

// The two officer queues fit the console's width with their row actions in view, as Rooms does
// (issue 922, K-123 criterion 10): long text wraps, and a row keeps three actions in line at most.
describe('the closures table and the requests queue fit without scrolling sideways', () => {
  const CLOSURES = 'app/pages/rooms/manage/closures.vue'
  const REQUESTS = 'app/pages/rooms/manage/requests.vue'

  test('a closure reason wraps beside the span, who closed it and Reopen', async () => {
    const source = await Bun.file(CLOSURES).text()
    expect(source).toContain(`{ accessorKey: 'reason', header: 'Why', meta: { class: { th: HIDE_BELOW_SM, td: \`\${HIDE_BELOW_SM} whitespace-normal\` } } }`)
  })

  test('a request status wraps, its long badges included', async () => {
    const source = await Bun.file(REQUESTS).text()
    expect(source).toContain(`header: 'Status',\n    meta: { class: { td: 'whitespace-normal' } },`)
    expect(source.match(/\.\.\.WRAPPING_BADGE/g) ?? []).toHaveLength(3)
  })

  test('a request row keeps three actions in line and the rest behind More actions', async () => {
    const source = await Bun.file(REQUESTS).text()
    expect(source).toContain('rowOverflow(row.original.id, [')
    expect(source).toContain(`label: 'Not one of ours'`)
    expect(source).toContain(`label: 'Use one of ours'`)
    expect(source).toContain(`label: 'Send back'`)
    expect(source).not.toContain(`() => 'Not one of ours'`)
  })
})

describe('a segmented toggle is not colour alone (K-101, issue 1153 item 5)', () => {
  test('every toggle says which one is pressed and marks it visibly', async () => {
    const offenders: string[] = []
    for (const path of [CALENDAR, MINE, ROTA]) {
      const source = await read(path)
      if (!source.includes('aria-pressed')) offenders.push(`${path}: nothing says which is pressed`)
      if (!source.includes('i-lucide-check')) offenders.push(`${path}: nothing marks it but the colour`)
    }
    expect(offenders).toEqual([])
  })
})
