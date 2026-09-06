import { describe, expect, test } from 'bun:test'
import { TICKET_TYPE_REFERENCES, everSoldColumn, everSoldQuery, ticketTypesQuery } from '#server/utils/ticket-types'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TicketTypeReference } from '#server/utils/ticket-types'
import type { TestDatabase } from '#tests/helpers/database'

// D-119 on the real migrations. "Has ever been sold" is the criterion the rest of the module
// leans on, and it is a question about rows in other tables rather than a flag on this one.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function standard(database: TestDatabase, over: Record<string, unknown> = {}): string {
  const values = { id: 'tt-1', name: 'Standard', price: 700, kind: 'SINGLE', ...over }
  insert(database, 'ticket_types', values)
  return String(values.id)
}

function sold(database: TestDatabase, statement: ReturnType<typeof everSoldQuery>): boolean {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<{ sold: number }>(database, query, ...parameters)[0]!.sold === 1
}

// What D-104 will add, stood up here so the predicate can be proved against rows that do not
// exist yet.
const FUTURE_SALE: TicketTypeReference = {
  table: 'future_tickets',
  column: 'ticket_type_id',
  sale: true,
  why: 'a stand-in for the tickets table, for proving the predicate reads rows',
}

function withFutureTickets(database: TestDatabase): void {
  database.raw.exec(`
    CREATE TABLE future_tickets (
      id text PRIMARY KEY,
      ticket_type_id text NOT NULL REFERENCES ticket_types(id)
    )
  `)
}

describe('a ticket type is global, uniquely named and priced in pence (criterion 1)', () => {
  test('the name is held once across the whole system', async () => {
    await withDatabase((database) => {
      standard(database)
      expect(() => standard(database, { id: 'tt-2' })).toThrow()
    })
  })

  // Two types called Standard and standard are one name to everybody who reads a report, so the
  // database refuses the second rather than leaving it to the write path.
  test('the name is held once whatever the capitals', async () => {
    await withDatabase((database) => {
      standard(database)
      expect(() => standard(database, { id: 'tt-2', name: 'STANDARD' })).toThrow()
      expect(() => standard(database, { id: 'tt-3', name: 'standard' })).toThrow()
      expect(() => standard(database, { id: 'tt-4', name: 'Standard seat' })).not.toThrow()
    })
  })

  test('a price is integer pence and never negative', async () => {
    await withDatabase((database) => {
      expect(() => standard(database, { id: 'tt-free', name: 'Comp', price: 0 })).not.toThrow()
      expect(() => standard(database, { id: 'tt-owed', name: 'Owed', price: -1 })).toThrow()
    })
  })

  test('a kind and an access kind are the enumerated ones or nothing', async () => {
    await withDatabase((database) => {
      expect(() => standard(database, { id: 'tt-pass', name: 'Pass admission', kind: 'PASS_ADMISSION' })).not.toThrow()
      expect(() => standard(database, { id: 'tt-odd', name: 'Odd', kind: 'SEASON' })).toThrow()
      expect(() => standard(database, { id: 'tt-a', name: 'Access', accessKind: 'ACCESS' })).toThrow()
      expect(() => standard(database, { id: 'tt-b', name: 'Access', access_kind: 'ACCESS' })).not.toThrow()
      expect(() => standard(database, { id: 'tt-c', name: 'Carer', access_kind: 'CARER' })).toThrow()
    })
  })
})

describe('the listing is searched and paged in SQL', () => {
  test('a search matches without regard to capitals and binds two parameters', async () => {
    await withDatabase((database) => {
      standard(database)
      standard(database, { id: 'tt-2', name: 'Member' })
      standard(database, { id: 'tt-3', name: 'Concession', archived: 1 })

      const [query, ...parameters] = boundStatement(
        database,
        ticketTypesQuery({ includeArchived: false, search: 'stan' }, 25, 0),
      )
      expect(parameters).toEqual(['%stan%', 25, 0])
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['tt-1'])
    })
  })

  // A percent sign somebody typed is a character they are looking for, not every row.
  test('a wildcard in the term is a character, not a wildcard', async () => {
    await withDatabase((database) => {
      standard(database)
      standard(database, { id: 'tt-2', name: '50% off' })

      const [query, ...parameters] = boundStatement(
        database,
        ticketTypesQuery({ includeArchived: true, search: '%' }, 25, 0),
      )
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['tt-2'])
    })
  })

  test('the archived filter and the page window are the same question the count asks', async () => {
    await withDatabase((database) => {
      standard(database)
      standard(database, { id: 'tt-2', name: 'Member' })
      standard(database, { id: 'tt-3', name: 'Retired', archived: 1 })

      const [query, ...parameters] = boundStatement(
        database,
        ticketTypesQuery({ includeArchived: false }, 1, 1),
      )
      expect(parameters).toEqual([1, 1])
      expect(rows<{ id: string }>(database, query, ...parameters).map(row => row.id)).toEqual(['tt-1'])
    })
  })
})

describe('"has ever been sold" is a query over rows, never a flag (criterion 2)', () => {
  // A flag is a thing somebody forgets to set, and the type is then deletable with tickets
  // against it. The registry below is what the predicate reads instead.
  test('the table carries no column that could stand in for the predicate', async () => {
    await withDatabase((database) => {
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('ticket_types')`)
        .map(column => column.name)
      expect(columns.filter(name => /sold|sale|used|ever/.test(name))).toEqual([])
    })
  })

  // The one that fails when D-104 lands: a new table pointing at ticket_types is a sale or it is
  // not, and somebody has to say which.
  test('every table pointing at ticket_types is classified in the registry', async () => {
    await withDatabase((database) => {
      const tables = rows<{ name: string }>(database, `SELECT name FROM sqlite_master WHERE type = 'table'`)
      const pointing: string[] = []
      for (const { name } of tables) {
        const keys = rows<{ table: string, from: string }>(database, `PRAGMA foreign_key_list('${name}')`)
        for (const key of keys) {
          if (key.table === 'ticket_types') pointing.push(`${name}.${key.from}`)
        }
      }
      const declared = TICKET_TYPE_REFERENCES.map(reference => `${reference.table}.${reference.column}`)
      expect(pointing.sort()).toEqual(declared.sort())
    })
  })

  test('a price override is configuration, so a type with one has still never sold', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      insert(database, 'venues', { id: 'v1', name: 'The Theatre', capacity: 120 })
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'show_ticket_overrides', { id: 'o1', show_id: 's1', ticket_type_id: id, price: 500 })

      // A price override is not a sale, whatever else the registry now classifies (D-104).
      expect(sold(database, everSoldQuery(id))).toBe(false)
    })
  })

  test('a sale table with no row for this type still says never sold', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      withFutureTickets(database)
      expect(sold(database, everSoldQuery(id, [FUTURE_SALE]))).toBe(false)
    })
  })

  // The proof the predicate is not decorative: one row in a sale table flips it, with no write to
  // ticket_types at all.
  test('one sold ticket flips it, and nothing on the type itself changed', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      withFutureTickets(database)
      insert(database, 'future_tickets', { id: 'ticket-1', ticket_type_id: id })

      expect(sold(database, everSoldQuery(id, [FUTURE_SALE]))).toBe(true)
      expect(sold(database, everSoldQuery('tt-other', [FUTURE_SALE]))).toBe(false)
    })
  })

  test('it binds one parameter per sale table however many tickets there are', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      withFutureTickets(database)
      for (let index = 0; index < 200; index++) {
        insert(database, 'future_tickets', { id: `ticket-${index}`, ticket_type_id: id })
      }

      const [, ...parameters] = boundStatement(database, everSoldQuery(id, [FUTURE_SALE]))
      expect(parameters).toEqual([id])
      expect(sold(database, everSoldQuery(id, [FUTURE_SALE]))).toBe(true)
    })
  })

  test('the listing answers the same question per row, binding nothing', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      standard(database, { id: 'tt-2', name: 'Member', price: 500 })
      withFutureTickets(database)
      insert(database, 'future_tickets', { id: 'ticket-1', ticket_type_id: id })

      const [query, ...parameters] = boundStatement(
        database,
        everSoldColumn('t', [FUTURE_SALE]),
      )
      expect(parameters).toEqual([])

      const listed = rows<{ id: string, everSold: number }>(
        database,
        `SELECT t.id AS id, ${query} AS everSold FROM ticket_types t ORDER BY t.id`,
      )
      expect(listed).toEqual([{ id: 'tt-1', everSold: 1 }, { id: 'tt-2', everSold: 0 }])
    })
  })
})

describe('archiving keeps a type resolvable, deleting one that sold is refused (criteria 2 and 3)', () => {
  test('an archived type is still there to resolve a historical ticket', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      withFutureTickets(database)
      insert(database, 'future_tickets', { id: 'ticket-1', ticket_type_id: id })
      database.batch([['UPDATE ticket_types SET archived = 1 WHERE id = ?', id]])

      const resolved = rows<{ name: string, archived: number }>(
        database,
        'SELECT t.name AS name, t.archived AS archived FROM future_tickets f JOIN ticket_types t ON t.id = f.ticket_type_id',
      )
      expect(resolved).toEqual([{ name: 'Standard', archived: 1 }])
    })
  })

  // The database is the backstop under the route's refusal: restrict, so a sold type cannot go
  // even if something forgets to ask.
  test('the foreign key refuses the delete even when the predicate is not consulted', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      insert(database, 'venues', { id: 'v1', name: 'The Theatre', capacity: 120 })
      insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull' })
      insert(database, 'show_ticket_overrides', { id: 'o1', show_id: 's1', ticket_type_id: id, price: 500 })

      expect(() => database.batch([['DELETE FROM ticket_types WHERE id = ?', id]])).toThrow()
    })
  })

  test('a type nothing points at deletes outright', async () => {
    await withDatabase((database) => {
      const id = standard(database)
      database.batch([['DELETE FROM ticket_types WHERE id = ?', id]])
      expect(rows<{ n: number }>(database, 'SELECT count(*) n FROM ticket_types')[0]!.n).toBe(0)
    })
  })
})
