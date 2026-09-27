import { describe, expect, test } from 'bun:test'

// No write on a request for a room we do not manage, nor the closure and note removals beside them,
// inserts its audit row after the write (0049). tests/integration/external-audit.test.ts pins each.

const ROUTES = 'server/api/admin/rooms'
const WRITERS = [
  `${ROUTES}/requests/[id]/unlist.post.ts`,
  `${ROUTES}/blackouts/[id].delete.ts`,
  `${ROUTES}/external-spaces/[id]/notes/[purpose].delete.ts`,
  `${ROUTES}/external-requests/[id]/assign.post.ts`,
  `${ROUTES}/external-requests/[id]/submit.post.ts`,
  `${ROUTES}/external-requests/[id]/relist.post.ts`,
  `${ROUTES}/external-requests/[id]/refuse-assignment.post.ts`,
  'server/api/rooms/external-requests/[id]/cancel.post.ts',
]

const read = (path: string): Promise<string> => Bun.file(path).text()

describe('the external-request writes audit in their own batch (0049)', () => {
  test('none of them inserts its audit row after the write', async () => {
    const separate: string[] = []
    for (const path of WRITERS) if ((await read(path)).includes('insert(schema.auditLog)')) separate.push(path)
    expect(separate).toEqual([])
  })

  test('an assignment and a note are written in the move\'s batch, not after it', async () => {
    for (const verb of ['assign', 'refuse-assignment']) {
      const source = await read(`${ROUTES}/external-requests/[id]/${verb}.post.ts`)
      expect(source).not.toContain('insert(schema.externalAssignments)')
      expect(source).not.toContain('insert(schema.externalSpaceNotes)')
    }
  })

  test('relisting never claims a booking and then cancels it', async () => {
    expect(await read(`${ROUTES}/external-requests/[id]/relist.post.ts`)).not.toContain('update(schema.roomBookings)')
  })
})
