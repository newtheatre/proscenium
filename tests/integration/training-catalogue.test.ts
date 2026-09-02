import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The catalogue on the real migrations. The form names the field a refusal belongs to; these are
// the constraints that make the same refusal a guarantee (G-107, G-110, G-123).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'lead@example.invalid', 'A Lead'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'other@example.invalid', 'Another Lead'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'BACKSTAGE', 'Backstage'],
  ])
}

function columnsOf(database: TestDatabase, table: string): string[] {
  return rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('${table}')`)
    .map(column => column.name)
}

function addModule(database: TestDatabase, columns: Record<string, unknown>): void {
  const values = { id: 'TECH-111', department: 'TECH', kind: 'MODULE', name: 'Working at height', ...columns }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO modules (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

describe('a module belongs to a department that exists (G-107 criterion 1)', () => {
  test('an unknown department is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { department: 'NOSUCH' })).toThrow()
    })
  })

  test('a department with modules against it cannot be deleted out from under them', async () => {
    await withDatabase((database) => {
      seed(database)
      addModule(database, {})
      expect(() => database.batch([[`DELETE FROM departments WHERE code = 'TECH'`]])).toThrow()
    })
  })

  test('a published id is held once', async () => {
    await withDatabase((database) => {
      seed(database)
      addModule(database, {})
      expect(() => addModule(database, { name: 'Something else' })).toThrow()
    })
  })

  test('a module starts as a draft, so nothing is published by writing it', async () => {
    await withDatabase((database) => {
      seed(database)
      addModule(database, {})
      expect(rows<{ status: string }>(database, 'SELECT status FROM modules')[0]?.status).toBe('DRAFT')
    })
  })
})

describe('the vocabularies are closed where they are about process (0033)', () => {
  test('a kind outside the three is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { kind: 'WORKSHOP' })).toThrow()
    })
  })

  test('a delivery mode, an expiry mode and a status outside their sets are refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { delivery_mode: 'BY_POST' })).toThrow()
      expect(() => addModule(database, { expiry_mode: 'SOMETIMES', expiry_months: 12 })).toThrow()
      expect(() => addModule(database, { status: 'PUBLISHED' })).toThrow()
    })
  })

  // The department vocabulary is committee-editable, so it is a table and carries no CHECK: a
  // constraint behind an editable list breaks writes the moment the list is used (0033).
  test('a department is added without a migration', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([['INSERT INTO departments (code, name) VALUES (?, ?)', 'WARDROBE', 'Wardrobe']])
      addModule(database, { id: 'WARD-101', department: 'WARDROBE' })
      expect(rows(database, 'SELECT id FROM modules')).toHaveLength(1)
    })
  })
})

describe('a safety-critical module is never fully self-directed (G-107 criterion 2)', () => {
  test('the pairing is refused by the database as well as by the form', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { safety_critical: 1, delivery_mode: 'SELF_DIRECTED' })).toThrow()
    })
  })

  test('hybrid is allowed, because the assessed half is still in person', async () => {
    await withDatabase((database) => {
      seed(database)
      addModule(database, { safety_critical: 1, delivery_mode: 'HYBRID' })
      expect(rows(database, 'SELECT id FROM modules')).toHaveLength(1)
    })
  })
})

describe('a brief carries no lifetime and grants nothing (G-107 criterion 4, G-123 criterion 6)', () => {
  test('a brief with an expiry policy is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { kind: 'BRIEF', expiry_mode: 'ACADEMIC_YEAR' })).toThrow()
      expect(() => addModule(database, { kind: 'BRIEF', expiry_mode: 'MONTHS', expiry_months: 12 })).toThrow()
    })
  })

  test('a brief granting trainer or supervisor standing is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { kind: 'BRIEF', grants_trainer: 1 })).toThrow()
      expect(() => addModule(database, { kind: 'BRIEF', grants_supervisor: 1 })).toThrow()
    })
  })

  test('only a brief is self-registrable', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { self_registrable: 1 })).toThrow()
      addModule(database, { kind: 'BRIEF', self_registrable: 1 })
      expect(rows(database, 'SELECT id FROM modules')).toHaveLength(1)
    })
  })
})

describe('a months policy is the only one carrying months (G-123 criterion 1)', () => {
  test('months without the policy, and the policy without months, are both refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { expiry_mode: 'MONTHS' })).toThrow()
      expect(() => addModule(database, { expiry_mode: 'NONE', expiry_months: 12 })).toThrow()
      expect(() => addModule(database, { expiry_mode: 'ACADEMIC_YEAR', expiry_months: 12 })).toThrow()
    })
  })

  test('a policy longer than the cap is refused by the constraint as well as the form', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => addModule(database, { expiry_mode: 'MONTHS', expiry_months: 121 })).toThrow()
      expect(() => addModule(database, { expiry_mode: 'MONTHS', expiry_months: 0 })).toThrow()
      addModule(database, { expiry_mode: 'MONTHS', expiry_months: 120 })
      expect(rows(database, 'SELECT id FROM modules')).toHaveLength(1)
    })
  })

  // The policy is the whole of what is kept (0018, G-123 criterion 3). Named in full rather than
  // filtered by guesswork, so any new column fails this and gets read rather than slipping past.
  test('the catalogue stores a policy, never a computed date', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(columnsOf(database, 'modules')).toEqual([
        'id', 'department', 'kind', 'name', 'description', 'notes', 'delivery_mode', 'expiry_mode',
        'expiry_months', 'allows_external', 'external_evidence', 'safety_critical',
        'signoff_required', 'grants_trainer', 'grants_supervisor', 'self_registrable', 'status',
        'sort', 'created_at', 'updated_at',
      ])
    })
  })
})

describe('a lead assignment is one per person per department (G-110 criteria 1 and 5)', () => {
  test('a person may lead more than one department', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO department_leads (id, department, user_id) VALUES ('l1', 'TECH', 'u1')`],
        [`INSERT INTO department_leads (id, department, user_id) VALUES ('l2', 'BACKSTAGE', 'u1')`],
      ])
      expect(rows(database, `SELECT id FROM department_leads WHERE user_id = 'u1'`)).toHaveLength(2)
    })
  })

  test('the same person is not assigned to one department twice', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`INSERT INTO department_leads (id, department, user_id) VALUES ('l1', 'TECH', 'u1')`]])
      expect(() => database.batch([
        [`INSERT INTO department_leads (id, department, user_id) VALUES ('l2', 'TECH', 'u1')`],
      ])).toThrow()
    })
  })

  // Criterion 3: the assignment carries its own expiry, and nothing derives standing from a flag.
  test('an assignment carries an expiry and provenance, and no standing column', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(columnsOf(database, 'department_leads'))
        .toEqual(['id', 'department', 'user_id', 'expires_at', 'granted_by', 'granted_at'])
    })
  })

  test('a department with a lead on it cannot be deleted out from under them', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([[`INSERT INTO department_leads (id, department, user_id) VALUES ('l1', 'TECH', 'u1')`]])
      expect(() => database.batch([[`DELETE FROM departments WHERE code = 'TECH'`]])).toThrow()
    })
  })
})

describe('material links belong to their module (G-107 criteria 1 and 5)', () => {
  test('a module carries none, one or several', async () => {
    await withDatabase((database) => {
      seed(database)
      addModule(database, {})
      database.batch([
        [`INSERT INTO module_materials (id, module_id, label, url, sort)
          VALUES ('m1', 'TECH-111', 'The manual', 'https://example.invalid/manual', 0)`],
        [`INSERT INTO module_materials (id, module_id, label, url, sort)
          VALUES ('m2', 'TECH-111', 'The video', 'https://example.invalid/video', 1)`],
      ])
      expect(rows(database, 'SELECT id FROM module_materials')).toHaveLength(2)
    })
  })

  test('a link cannot name a module that does not exist', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([
        [`INSERT INTO module_materials (id, module_id, label, url)
          VALUES ('m1', 'NOPE-1', 'The manual', 'https://example.invalid/manual')`],
      ])).toThrow()
    })
  })
})
