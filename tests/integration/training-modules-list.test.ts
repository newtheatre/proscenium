import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { capOf, fieldOf, filterQuerySchema, operatorsOf } from '#shared/utils/list-filters'
import { trainingModulesList } from '#shared/utils/training-modules-list'
import { trainingModulesClause } from '#server/utils/training-modules-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
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
