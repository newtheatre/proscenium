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
  'server/utils/approvals.ts',
  'server/utils/bookings.ts',
  'server/utils/tiers.ts',
  'server/utils/series.ts',
]

// Either spelling of an audit row written in a statement of its own. room-writes.ts is not listed:
// its audit inserts are builders, run inside the batches these files make.
const SEPARATE = /insert\(\s*schema\.auditLog\s*\)|db\.(run|all)\(\s*sql`\s*INSERT INTO audit_log/i

describe('the room writes audit in their own batch (0049)', () => {
  test('none of them inserts its audit row after the write', async () => {
    const separate: string[] = []
    for (const path of WRITERS) {
      if (SEPARATE.test(await Bun.file(path).text())) separate.push(path)
    }
    expect(separate).toEqual([])
  })
})
