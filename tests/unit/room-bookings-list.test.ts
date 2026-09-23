import { describe, expect, test } from 'bun:test'
import { viewRooms } from '#shared/utils/abilities'
import { fieldOf } from '#shared/utils/list-filters'
import { roomBookingsList } from '#shared/utils/room-bookings-list'
import { CONSOLE_NAV } from '#shared/utils/site-nav'

// The officer's bookings list, read as source (C-115 criterion 6, issue 1049). What its filters
// do against real rows is tests/integration/room-bookings-list.test.ts.

const ROUTE = 'server/api/admin/rooms/bookings/index.get.ts'
const PAGE = 'app/pages/rooms/manage/bookings.vue'

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('the list is read behind rooms.read and answers with an envelope', () => {
  test('the route asks for rooms.read before it reads anything', async () => {
    const source = await read(ROUTE)
    const asked = source.indexOf('requirePermission(event, \'rooms.read\')')
    expect(asked).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(source.indexOf('db.select'))
  })

  test('the route pages in SQL and returns the shared envelope, never a bare array', async () => {
    const source = await read(ROUTE)
    expect(source).toContain('filterQuerySchema(roomBookingsList)')
    expect(source).toContain('.limit(input.pageSize)')
    expect(source).toContain('.offset(offsetFor(input.page, input.pageSize))')
    expect(source).toContain('return envelope(items,')
  })
})

describe('the columns are an allow-list (C-115 criterion 6, 0011)', () => {
  test('the member is a name and nothing else about them', async () => {
    const source = await read(ROUTE)
    for (const column of ['schema.users.email', 'schema.users.studentId', 'schema.users.phone']) {
      expect(source).not.toContain(column)
    }
  })

  test('none of the free text a member wrote reaches the list', async () => {
    const source = await read(ROUTE)
    for (const column of ['schema.roomBookings.notes', 'schema.roomBookings.reason', 'schema.roomBookings.rejectionReason']) {
      expect(source).not.toContain(column)
    }
  })

  test('the select names its columns rather than taking the whole row', async () => {
    const source = await read(ROUTE)
    expect(source).not.toMatch(/db\.select\(\)\s*\.from\(schema\.roomBookings\)/)
  })
})

describe('the screen reads through the declaration (K-129)', () => {
  test('filters, search, sort and page live in the URL', async () => {
    const source = await read(PAGE)
    expect(source).toContain('useListQuery(roomBookingsList)')
    expect(source).toContain('<ConsoleFilters')
    expect(source).toContain('<UPagination')
    expect(source).toContain('\'/api/admin/rooms/bookings\'')
  })

  test('the declaration never offers a state the table cannot hold', () => {
    const status = fieldOf(roomBookingsList, 'status')
    expect(status?.options?.map(option => option.value)).toEqual(['CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED'])
  })

  test('the navigation lists it for anybody who reads rooms', () => {
    const entry = CONSOLE_NAV.flatMap(group => group.items).find(item => item.to === '/rooms/manage/bookings')
    expect(entry?.ability).toBe(viewRooms)
  })
})
