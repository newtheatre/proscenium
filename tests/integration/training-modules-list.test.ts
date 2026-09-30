import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { capOf, fieldOf, filterQuerySchema, operatorsOf } from '#shared/utils/list-filters'
import { trainingModulesList } from '#shared/utils/training-modules-list'
import { countAdminModules, listAdminModules, scopedClause, trainingModulesClause } from '#server/utils/training-modules-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { FilterField } from '#shared/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The training catalogue's console list through its declaration (K-129, G-129): every field is a
// plain column on modules, so one clause answers all of them.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function department(database: TestDatabase, code: string, name = code): void {
  database.batch([['INSERT INTO departments (code, name) VALUES (?, ?)', code, name]])
}

function addModule(database: TestDatabase, over: {
  id: string
  department: string
  kind?: string
  name?: string
  status?: string
  deliveryMode?: string
  safetyCritical?: boolean
  sort?: number
}): void {
  database.batch([[
    `INSERT INTO modules (id, department, kind, name, status, delivery_mode, safety_critical, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    over.id, over.department, over.kind ?? 'MODULE', over.name ?? over.id,
    over.status ?? 'ACTIVE', over.deliveryMode ?? 'IN_PERSON', over.safetyCritical ? 1 : 0, over.sort ?? 0,
  ]])
}

const schema = filterQuerySchema(trainingModulesList)
const parsed = (raw: Record<string, string>) => {
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function listed(database: TestDatabase, raw: Record<string, string>): string[] {
  const clause = trainingModulesClause(parsed(raw))
  const statement = sql`SELECT m.id AS id FROM modules m
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the training catalogue filters by its declaration (K-129)', () => {
  test('department is, is not and is any of', async () => {
    await withDatabase((database) => {
      department(database, 'TECH')
      department(database, 'FOH')
      addModule(database, { id: 'TECH-1', department: 'TECH' })
      addModule(database, { id: 'FOH-1', department: 'FOH' })

      expect(listed(database, { department: 'is:TECH' })).toEqual(['TECH-1'])
      expect(listed(database, { department: 'not:TECH' })).toEqual(['FOH-1'])
      expect(listed(database, { department: 'any:TECH,FOH' })).toEqual(['FOH-1', 'TECH-1'])
    })
  })

  test('kind, lifecycle, delivery and safety-critical all read from their own column', async () => {
    await withDatabase((database) => {
      department(database, 'TECH')
      addModule(database, { id: 'TECH-1', department: 'TECH', kind: 'CERTIFICATION', status: 'DRAFT', deliveryMode: 'HYBRID', safetyCritical: true })
      addModule(database, { id: 'TECH-2', department: 'TECH', kind: 'MODULE', status: 'ACTIVE', deliveryMode: 'IN_PERSON', safetyCritical: false })

      expect(listed(database, { kind: 'is:CERTIFICATION' })).toEqual(['TECH-1'])
      expect(listed(database, { lifecycle: 'is:DRAFT' })).toEqual(['TECH-1'])
      expect(listed(database, { deliveryMode: 'is:HYBRID' })).toEqual(['TECH-1'])
      expect(listed(database, { safetyCritical: 'true' })).toEqual(['TECH-1'])
      expect(listed(database, { safetyCritical: 'false' })).toEqual(['TECH-2'])
    })
  })

  test('search reaches the published id and the title', async () => {
    await withDatabase((database) => {
      department(database, 'TECH')
      addModule(database, { id: 'TECH-1', department: 'TECH', name: 'Working the desk' })
      addModule(database, { id: 'TECH-2', department: 'TECH', name: 'Rigging a lantern' })

      expect(listed(database, { search: 'desk' })).toEqual(['TECH-1'])
      expect(listed(database, { search: 'TECH-2' })).toEqual(['TECH-2'])
      expect(listed(database, { search: 'nobody' })).toEqual([])
    })
  })

  test('the default order is the list order, then the title, and a sort past its declaration is refused', async () => {
    await withDatabase((database) => {
      department(database, 'TECH')
      addModule(database, { id: 'TECH-1', department: 'TECH', name: 'Zebra', sort: 1 })
      addModule(database, { id: 'TECH-2', department: 'TECH', name: 'Amber', sort: 0 })

      expect(listed(database, {})).toEqual(['TECH-2', 'TECH-1'])
      expect(schema.safeParse({ sort: 'notes' }).success).toBe(false)
    })
  })

  test('a department list past its cap is refused before any statement is built', async () => {
    await withDatabase(() => {
      const cap = capOf(fieldOf(trainingModulesList, 'department')!)
      const many = Array.from({ length: cap + 1 }, (_, index) => `dept-${index}`)
      expect(schema.safeParse({ department: `any:${many.slice(0, cap).join(',')}` }).success).toBe(true)
      expect(schema.safeParse({ department: `any:${many.join(',')}` }).success).toBe(false)
    })
  })

  test('every field carries a column, so whereFrom never has to ask a binding for one', async () => {
    await withDatabase((database) => {
      department(database, 'TECH')
      addModule(database, { id: 'TECH-1', department: 'TECH' })
      for (const field of trainingModulesList.fields as readonly FilterField[]) {
        expect(field.column).toBeDefined()
        for (const operator of operatorsOf(field)) {
          const value = field.kind === 'yes-no' ? 'false' : (field.options?.[0]?.value ?? 'TECH')
          const raw = operator === 'empty' ? 'empty' : operator === 'between' ? `between:${value},${value}` : `${operator}:${value}`
          expect(() => listed(database, { [field.key]: raw })).not.toThrow()
        }
      }
    })
  })
})

// #1583: a lead holding no training.read is scoped by their own leads, and the statement that
// scope builds must name the `m` alias, or SQLite answers "no such column" (G-110).
describe('a department lead lists their own catalogue (G-110, #1583)', () => {
  const LEAD = 'lead-1'
  const OTHER = 'lead-2'
  const NOW = new Date('2026-09-29T12:00:00Z')
  const SECONDS = Math.floor(NOW.getTime() / 1000)
  const YEAR = { boundary: '07-31', carryOverDays: 0 }
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', LEAD, 'lead-1@e2e.newtheatre.org.uk', 'A lead'],
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', OTHER, 'lead-2@e2e.newtheatre.org.uk', 'Another lead'],
    ])
    for (const code of ['TECH', 'FOH', 'STAGE', 'WARDROBE']) department(database, code)
    addModule(database, { id: 'TECH-1', department: 'TECH' })
    addModule(database, { id: 'FOH-1', department: 'FOH' })
    addModule(database, { id: 'STAGE-1', department: 'STAGE' })
    addModule(database, { id: 'WARDROBE-1', department: 'WARDROBE' })
    database.batch([
      ['INSERT INTO department_leads (id, department, user_id, expires_at) VALUES (?, ?, ?, ?)', 'l-1', 'TECH', LEAD, null],
      ['INSERT INTO department_leads (id, department, user_id, expires_at) VALUES (?, ?, ?, ?)', 'l-2', 'FOH', LEAD, SECONDS + 86_400],
      ['INSERT INTO department_leads (id, department, user_id, expires_at) VALUES (?, ?, ?, ?)', 'l-3', 'STAGE', LEAD, SECONDS - 1],
      ['INSERT INTO department_leads (id, department, user_id, expires_at) VALUES (?, ?, ?, ?)', 'l-4', 'WARDROBE', OTHER, null],
    ])
    bindD1(database)
  })

  afterEach(() => {
    database.close()
  })

  test('the count and the page run, and hold only the departments the lead leads today', async () => {
    const clause = scopedClause(trainingModulesClause(parsed({})), LEAD, NOW)

    expect(await countAdminModules(clause)).toBe(2)
    expect((await listAdminModules(clause, 25, 0, YEAR, NOW)).map(one => one.id).sort()).toEqual(['FOH-1', 'TECH-1'])
  })

  test('the scope is ANDed onto a filter, never widening it', async () => {
    const clause = scopedClause(trainingModulesClause(parsed({ department: 'any:TECH,WARDROBE' })), LEAD, NOW)

    expect(await countAdminModules(clause)).toBe(1)
    expect((await listAdminModules(clause, 25, 0, YEAR, NOW)).map(one => one.id)).toEqual(['TECH-1'])
  })

  test('a reader with no lead scope sees every department', async () => {
    const clause = scopedClause(trainingModulesClause(parsed({})), undefined, NOW)

    expect(await countAdminModules(clause)).toBe(4)
  })
})
