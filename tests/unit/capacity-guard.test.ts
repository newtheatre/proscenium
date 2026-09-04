import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { TICKETS_ARE_A_SALE, TICKETS_HOLD_SEATS } from '#server/utils/capacity'
import { PERFORMANCE_REFERENCES } from '#server/utils/programme'
import { TICKET_TYPE_REFERENCES } from '#server/utils/ticket-types'

// D-105 criterion 2 as a build failure rather than a review habit: the capacity check is on the
// statement that takes the seat, so no other file may write a ticket.

const BUILDER = 'server/utils/capacity.ts'

async function serverFiles(): Promise<string[]> {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: 'server', onlyFiles: true })]
    .map(path => join('server', path))
    .filter(path => path !== BUILDER)
    .sort()
}

describe('nothing writes a ticket except the capacity builder (D-105 criterion 2)', () => {
  test('no other server file inserts into tickets', async () => {
    const offenders: string[] = []
    for (const file of await serverFiles()) {
      const source = await Bun.file(file).text()
      if (/INSERT\s+INTO\s+tickets\b/i.test(source) || /db\.insert\(\s*schema\.tickets\s*\)/.test(source)) {
        offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  // A count of rows is not a count of seats: an expired hold is a row. Anything reading the one
  // as the other reopens the defect the predicate exists to close.
  test('no other server file counts tickets without the holding predicate', async () => {
    const offenders: string[] = []
    for (const file of await serverFiles()) {
      const source = await Bun.file(file).text()
      for (const line of source.split('\n')) {
        if (!/count\(\*\)\s*FROM\s+tickets\b/i.test(line)) continue
        offenders.push(`${file}  ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// The two rows D-104 pushes when it migrates the tables. Written now so classifying `tickets` is
// adding a constant rather than deciding the rule a second time.
describe('the registry rows D-104 will add are already decided (D-105)', () => {
  test('tickets hold seats, and the count is the capacity rule rather than a row count', () => {
    expect(TICKETS_HOLD_SEATS.table).toBe('tickets')
    expect(TICKETS_HOLD_SEATS.sold).toBe(true)
    expect(TICKETS_HOLD_SEATS.heldBy).toBeDefined()
  })

  // "Has ever been sold" is about history, so a refunded ticket still counts here even though it
  // holds no seat. The two questions are deliberately different (D-119 criterion 2).
  test('a ticket is a sale of its type, refunded or not', () => {
    expect(TICKETS_ARE_A_SALE.table).toBe('tickets')
    expect(TICKETS_ARE_A_SALE.sale).toBe(true)
  })

  test('neither row is in its registry yet, because D-104 has not built the table', () => {
    expect(PERFORMANCE_REFERENCES.map(one => one.table)).not.toContain('tickets')
    expect(TICKET_TYPE_REFERENCES.map(one => one.table)).not.toContain('tickets')
  })
})
