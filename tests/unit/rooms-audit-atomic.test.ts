import { describe, expect, test } from 'bun:test'

// No room write inserts its audit row in a statement of its own after the write (0049). The row
// rides the write's batch, and tests/integration/rooms-audit.test.ts pins each one.

const WRITERS = [
  'server/api/rooms/bookings.post.ts',
  'server/api/rooms/requests.post.ts',
  'server/api/rooms/series.post.ts',
  'server/api/rooms/bookings/[id]/cancel.post.ts',
  'server/api/rooms/bookings/[id]/index.put.ts',
  'server/api/admin/rooms/bookings/[id]/bump.post.ts',
  'server/api/admin/rooms/requests/decide.post.ts',
  'server/utils/room-requests.ts',
]

describe('the room writes audit in their own batch (0049)', () => {
  test('none of them inserts its audit row after the write', async () => {
    const separate: string[] = []
    for (const path of WRITERS) {
      if ((await Bun.file(path).text()).includes('insert(schema.auditLog)')) separate.push(path)
    }
    expect(separate).toEqual([])
  })
})
