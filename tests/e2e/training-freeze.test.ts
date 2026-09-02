import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { londonParts } from '#shared/utils/london'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-109 through the real routes: what a record means is fixed the moment one exists, and the only
// way to mean something else is to retire the module and create a successor.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let cookie = ''
let memberId = ''
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  const member = await registerMember(app, 'freeze-member', generatePassword(), { signIn: false })
  memberId = member.id

  department = `FRZ${suffix()}`
  expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'Freezing' })).status).toBe(200)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

// A London day, because that is what an award date is (0014).
function today(): string {
  const { year, month, day } = londonParts(new Date())
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

interface ModuleBody {
  department: string
  kind: string
  name: string
  status: string
  grantsTrainer?: boolean
  grantsSupervisor?: boolean
  safetyCritical?: boolean
  description?: string | null
  deliveryMode?: string
}

function body(over: Partial<ModuleBody> = {}): ModuleBody {
  return { department, kind: 'MODULE', name: 'Working at height', status: 'ACTIVE', ...over }
}

async function addModule(over: Partial<ModuleBody> = {}): Promise<string> {
  const id = `FRZ-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', { id, ...body(over) })
  expect(answered.status).toBe(200)
  return id
}

const edit = (id: string, over: Partial<ModuleBody> = {}): Promise<Response> =>
  send('PUT', `/api/admin/training/modules/${id}`, body(over))

// One award, straight through the sign-off route, so the record is the one the app writes.
async function award(module: string, awardedOn = today()): Promise<string> {
  const answered = await send('POST', '/api/admin/training/signoffs', { userId: memberId, moduleId: module, awardedOn })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const revoke = (record: string): Promise<Response> =>
  send('POST', `/api/admin/training/records/${record}/revoke`, { reason: 'Awarded in error' })

interface Listed { id: string, kind: string, grantsTrainer: boolean, grantsSupervisor: boolean, frozen?: boolean }

async function listed(id: string): Promise<Listed | undefined> {
  const listing = await (await send('GET', '/api/admin/training/modules')).json() as { items: Listed[] }
  return listing.items.find(module => module.id === id)
}

describe.skipIf(skip !== null)('a kind is frozen while records exist (G-109 criterion 1)', () => {
  test('a module with no records against it still changes kind freely', async () => {
    const module = await addModule()
    expect((await edit(module, { kind: 'CERTIFICATION' })).status).toBe(200)
    expect(read<{ kind: string }>('SELECT kind FROM modules WHERE id = ?', module)?.kind).toBe('CERTIFICATION')
  })

  test('one record makes the kind a 409 that says to retire and recreate', async () => {
    const module = await addModule()
    await award(module)

    const answered = await edit(module, { kind: 'CERTIFICATION' })
    expect(answered.status).toBe(409)
    const message = await said(answered)
    expect(message).toContain('kind')
    expect(message.toLowerCase()).toContain('retire')
    expect(read<{ kind: string }>('SELECT kind FROM modules WHERE id = ?', module)?.kind).toBe('MODULE')
  })

  test('everything else about the module still edits while it is frozen', async () => {
    const module = await addModule()
    await award(module)

    expect((await edit(module, { name: 'Renamed', description: 'A fuller description' })).status).toBe(200)
    expect(read<{ name: string }>('SELECT name FROM modules WHERE id = ?', module)?.name).toBe('Renamed')
  })

  // Unrevoked, not currently valid: a record that lapsed years ago was still awarded under these
  // semantics, and changing them now would rewrite what it certified.
  test('a record long expired but never revoked freezes the kind just the same', async () => {
    const module = await addModule({ kind: 'CERTIFICATION' })
    const record = await award(module)
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE training_records SET awarded_on = ?, expires_on = ? WHERE id = ?')
        .run('2019-01-01', '2020-01-01', record)
    }
    finally {
      database.close()
    }

    expect((await edit(module, { kind: 'MODULE' })).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('the granting flags freeze the same way (G-109 criterion 2)', () => {
  test('trainer-granting cannot be switched on under an existing record', async () => {
    const module = await addModule({ kind: 'CERTIFICATION' })
    await award(module)

    const answered = await edit(module, { kind: 'CERTIFICATION', grantsTrainer: true })
    expect(answered.status).toBe(409)
    expect((await said(answered)).toLowerCase()).toContain('trainer')
    expect(read<{ grants: number }>('SELECT grants_trainer grants FROM modules WHERE id = ?', module)?.grants).toBe(0)
  })

  // Taking standing away by editing the module would revoke nobody's record and leave every
  // holder's standing to vanish silently. Revoking the record is the sanctioned path (G-111).
  test('trainer-granting cannot be switched off under an existing record either', async () => {
    const module = await addModule({ kind: 'CERTIFICATION', grantsTrainer: true })
    await award(module)

    expect((await edit(module, { kind: 'CERTIFICATION', grantsTrainer: false })).status).toBe(409)
    expect(read<{ grants: number }>('SELECT grants_trainer grants FROM modules WHERE id = ?', module)?.grants).toBe(1)
  })

  test('supervisor-granting is frozen too, and the refusal names it', async () => {
    const module = await addModule({ kind: 'CERTIFICATION' })
    await award(module)

    const answered = await edit(module, { kind: 'CERTIFICATION', grantsSupervisor: true })
    expect(answered.status).toBe(409)
    expect((await said(answered)).toLowerCase()).toContain('supervisor')
  })

  test('an edit changing both is refused once, naming both', async () => {
    const module = await addModule({ kind: 'CERTIFICATION' })
    await award(module)

    const message = (await said(await edit(module, {
      kind: 'CERTIFICATION',
      grantsTrainer: true,
      grantsSupervisor: true,
    }))).toLowerCase()
    expect(message).toContain('trainer')
    expect(message).toContain('supervisor')
  })
})

describe.skipIf(skip !== null)('revoking every record thaws the module (G-109 criterion 3)', () => {
  test('the fields are editable again once nothing unrevoked is left', async () => {
    const module = await addModule({ kind: 'CERTIFICATION' })
    const first = await award(module)
    const second = await award(module)

    expect((await edit(module, { kind: 'CERTIFICATION', grantsTrainer: true })).status).toBe(409)

    expect((await revoke(first)).status).toBe(200)
    expect((await edit(module, { kind: 'CERTIFICATION', grantsTrainer: true })).status).toBe(409)

    expect((await revoke(second)).status).toBe(200)
    expect((await edit(module, { kind: 'CERTIFICATION', grantsTrainer: true })).status).toBe(200)

    const stored = read<{ kind: string, grants: number }>(
      'SELECT kind, grants_trainer grants FROM modules WHERE id = ?', module)
    expect(stored).toMatchObject({ kind: 'CERTIFICATION', grants: 1 })
  })

  test('thawing costs no history: the revoked records are still there', async () => {
    const module = await addModule()
    const record = await award(module)
    expect((await revoke(record)).status).toBe(200)
    expect((await edit(module, { kind: 'BRIEF' })).status).toBe(200)

    const held = read<{ total: number }>(
      'SELECT count(*) total FROM training_records WHERE module_id = ?', module)
    expect(held?.total).toBe(1)
  })

  test('the listing says which modules are frozen, so the screen can say why', async () => {
    const module = await addModule()
    expect((await listed(module))?.frozen).toBe(false)

    const record = await award(module)
    expect((await listed(module))?.frozen).toBe(true)

    expect((await revoke(record)).status).toBe(200)
    expect((await listed(module))?.frozen).toBe(false)
  })
})

describe.skipIf(skip !== null)('retire and recreate is the path (G-109 criterion 4)', () => {
  test('the frozen module retires, and the successor takes a new id and carries no records', async () => {
    const original = await addModule({ kind: 'MODULE' })
    await award(original)
    expect((await edit(original, { kind: 'CERTIFICATION' })).status).toBe(409)

    // Retiring is a lifecycle change, which is not frozen: the module stays readable so an old
    // record's module link still resolves (G-103 criterion 5).
    expect((await edit(original, { status: 'RETIRED' })).status).toBe(200)

    const successor = await addModule({ kind: 'CERTIFICATION' })
    expect(successor).not.toBe(original)
    expect(read<{ total: number }>(
      'SELECT count(*) total FROM training_records WHERE module_id = ?', successor)?.total).toBe(0)

    // The successor is unfrozen until it awards its own first record.
    expect((await edit(successor, { kind: 'CERTIFICATION', grantsTrainer: true })).status).toBe(200)

    const kept = read<{ status: string, kind: string }>(
      'SELECT status, kind FROM modules WHERE id = ?', original)
    expect(kept).toMatchObject({ status: 'RETIRED', kind: 'MODULE' })
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
