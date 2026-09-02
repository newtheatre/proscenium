import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { CONFIG_KEYS } from '#shared/utils/config'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-107, G-110 and G-123 through the real routes and the real screen. Nothing here reads a stored
// validity: the catalogue keeps a policy, and what a record would be worth is worked out (0018).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let memberCookie = ''

const password = generatePassword()
const officer = { ...syntheticPerson(47), email: registrableAddress('training-officer') }
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  memberCookie = (await adminSession(app, { roles: [] })).cookie

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password }, '')
  markVerified(app, officer.email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email: officer.email, password }, '')
  const first = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)

  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile]).exitCode).toBe(0)

  forgetSpentStep(app, officer.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password }, ''))
    .json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  }, '')
  cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}, BOOT_TIMEOUT_MS)

// One browser backs every view, so the screen cases share a signed-in session rather than each
// paying for the challenge again.
async function signedInView(): Promise<Bun.WebView> {
  forgetSpentStep(app, officer.email)
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

  const code = await codeForStep(secret, stepFor(new Date()) + 1)
  for (const [index, digit] of [...code].entries()) {
    await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
  }
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  return view
}

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

const officerId = (): string => read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id

async function addDepartment(over: Record<string, unknown> = {}): Promise<string> {
  const code = `DEPT${suffix()}`
  const answered = await send('POST', '/api/admin/training/departments', { code, name: `Department ${code}`, ...over })
  expect(answered.status).toBe(200)
  return code
}

interface ModuleRow {
  id: string
  department: string
  expiryMode: string
  expiresIfAwardedToday: string | null
  materials: { label: string, url: string }[]
  notes?: string | null
}

async function addModule(department: string, over: Record<string, unknown> = {}): Promise<Response> {
  return send('POST', '/api/admin/training/modules', {
    id: `MOD-${suffix()}`,
    department,
    kind: 'MODULE',
    name: 'Working at height',
    ...over,
  })
}

async function catalogue(): Promise<ModuleRow[]> {
  const listing = await (await send('GET', '/api/admin/training/modules')).json() as { items: ModuleRow[] }
  return listing.items
}

describe.skipIf(skip !== null)('the catalogue is administered (G-107)', () => {
  test('a module carries its kind, mode, materials and lifecycle (criterion 1)', async () => {
    const department = await addDepartment()
    const answered = await addModule(department, {
      kind: 'CERTIFICATION',
      deliveryMode: 'HYBRID',
      status: 'ACTIVE',
      materials: [{ label: 'The manual', url: 'https://example.invalid/manual' }],
    })
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const module = (await catalogue()).find(one => one.id === id)
    expect(module?.materials).toEqual([{ label: 'The manual', url: 'https://example.invalid/manual' }])
  })

  test('a published id is taken once, and the refusal says so (criterion 1)', async () => {
    const department = await addDepartment()
    const { id } = await (await addModule(department)).json() as { id: string }

    const again = await send('POST', '/api/admin/training/modules', {
      id,
      department,
      kind: 'MODULE',
      name: 'Something else',
    })
    expect(again.status).toBe(409)
  })

  test('a safety-critical module cannot be saved fully self-directed (criterion 2)', async () => {
    const department = await addDepartment()
    const refused = await addModule(department, { safetyCritical: true, deliveryMode: 'SELF_DIRECTED' })
    expect(refused.status).toBe(400)

    const allowed = await addModule(department, { safetyCritical: true, deliveryMode: 'HYBRID' })
    expect(allowed.status).toBe(200)
  })

  test('a draft is what a module starts as, and it can be published and retired (criterion 3)', async () => {
    const department = await addDepartment()
    const { id } = await (await addModule(department)).json() as { id: string }
    expect(read<{ status: string }>('SELECT status FROM modules WHERE id = ?', id)?.status).toBe('DRAFT')

    const published = await send('PUT', `/api/admin/training/modules/${id}`, {
      department,
      kind: 'MODULE',
      name: 'Working at height',
      status: 'RETIRED',
    })
    expect(published.status).toBe(200)
    expect(read<{ status: string }>('SELECT status FROM modules WHERE id = ?', id)?.status).toBe('RETIRED')
  })

  test('a brief carries no expiry and grants nothing (criterion 4)', async () => {
    const department = await addDepartment()
    expect((await addModule(department, { kind: 'BRIEF', expiryMode: 'ACADEMIC_YEAR' })).status).toBe(400)
    expect((await addModule(department, { kind: 'BRIEF', expiryMode: 'MONTHS', expiryMonths: 12 })).status).toBe(400)
    expect((await addModule(department, { kind: 'BRIEF', grantsTrainer: true })).status).toBe(400)
    expect((await addModule(department, { kind: 'BRIEF', grantsSupervisor: true })).status).toBe(400)
    expect((await addModule(department, { kind: 'BRIEF' })).status).toBe(200)
  })

  test('a module cannot be filed under a department that does not exist', async () => {
    expect((await addModule('NOSUCHDEPT')).status).toBe(404)
  })

  // An edit that never mentions the links must not delete them: a body with no `materials` key is
  // an instruction about everything else, not an instruction to forget the manual.
  test('an edit that omits the links leaves them alone, and one that sends them replaces them', async () => {
    const department = await addDepartment()
    const { id } = await (await addModule(department, {
      materials: [{ label: 'The manual', url: 'https://example.invalid/manual' }],
    })).json() as { id: string }

    const silent = await send('PUT', `/api/admin/training/modules/${id}`, {
      department,
      kind: 'MODULE',
      name: 'Renamed and nothing said about links',
    })
    expect(silent.status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM module_materials WHERE module_id = ?', id)?.n).toBe(1)

    const cleared = await send('PUT', `/api/admin/training/modules/${id}`, {
      department,
      kind: 'MODULE',
      name: 'Links deliberately emptied',
      materials: [],
    })
    expect(cleared.status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM module_materials WHERE module_id = ?', id)?.n).toBe(0)
  })

  // The published id is the key members quote, so an edit naming a different one changes nothing.
  test('the published id is immutable once created (criterion 1)', async () => {
    const department = await addDepartment()
    const { id } = await (await addModule(department)).json() as { id: string }

    const renamed = await send('PUT', `/api/admin/training/modules/${id}`, {
      id: `OTHER-${suffix()}`,
      department,
      kind: 'MODULE',
      name: 'Working at height',
    })
    expect(renamed.status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM modules WHERE id = ?', id)?.n).toBe(1)
  })

  // The mechanism G-103 will read to keep drafts away from members. It has to be switchable from
  // a query string, which a naive boolean coercion would quietly make impossible.
  test('drafts and retired modules can be filtered out (criterion 3)', async () => {
    const department = await addDepartment()
    const draft = await (await addModule(department, { name: 'Still a draft' })).json() as { id: string }
    const live = await (await addModule(department, {
      name: 'Published',
      status: 'ACTIVE',
    })).json() as { id: string }

    const shown = await (await send('GET', `/api/admin/training/modules?includeDrafts=false&department=${department}`))
      .json() as { items: ModuleRow[] }
    expect(shown.items.map(one => one.id)).toEqual([live.id])
    expect(shown.items.some(one => one.id === draft.id)).toBe(false)

    const all = await (await send('GET', `/api/admin/training/modules?department=${department}`))
      .json() as { items: ModuleRow[] }
    expect(all.items.some(one => one.id === draft.id)).toBe(true)
  })

  // Standing to touch the catalogue at all is settled before a body is read; which department a
  // request names is only knowable from the body, so that half is necessarily checked after (0037).
  test('somebody with no standing is refused before the body is validated', async () => {
    expect((await send('GET', '/api/admin/training/modules', undefined, memberCookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/training/departments', undefined, memberCookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/training/modules', { id: 'X-1' }, memberCookie)).status).toBe(403)
    expect((await send('PUT', '/api/admin/training/modules/ANY-1', {}, memberCookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/training/departments', {}, memberCookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a department lead stewards their own catalogue (G-110)', () => {
  test('a lead is assigned to a department, and one person may lead several (criteria 1 and 5)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const first = await addDepartment()
    const second = await addDepartment()

    expect((await send('POST', `/api/admin/training/departments/${first}/leads`, { userId: lead.id })).status).toBe(200)
    expect((await send('POST', `/api/admin/training/departments/${second}/leads`, { userId: lead.id })).status).toBe(200)

    const held = read<{ n: number }>('SELECT count(*) n FROM department_leads WHERE user_id = ?', lead.id)
    expect(held?.n).toBe(2)

    // Criterion 5: both the actor and the person are on the trail.
    const entry = read<{ actor: string }>(
      `SELECT actor_id actor FROM audit_log WHERE action = 'department.lead.assigned' AND target = ?`,
      `user:${lead.id}`,
    )
    expect(entry?.actor).toBeTruthy()
  })

  test('an assignment defaults to lapsing at handover (criterion 3)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const department = await addDepartment()
    await send('POST', `/api/admin/training/departments/${department}/leads`, { userId: lead.id })

    const held = read<{ expiresAt: number }>(
      'SELECT expires_at expiresAt FROM department_leads WHERE user_id = ? AND department = ?',
      lead.id,
      department,
    )
    expect(held?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000))
    // The last instant of a 31 July, London, which is what the platform role model uses (0009).
    expect(new Date(held!.expiresAt * 1000).toISOString()).toMatch(/-07-31T2[23]:59:59/)
  })

  test('a lead edits their own department and no other (criterion 2)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = await addDepartment()
    const somebody = await addDepartment()
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })

    const mine = await send('POST', '/api/admin/training/modules', {
      id: `LEAD-${suffix()}`,
      department: theirs,
      kind: 'MODULE',
      name: 'Theirs to steward',
    }, lead.cookie)
    expect(mine.status).toBe(200)

    const theirsNot = await send('POST', '/api/admin/training/modules', {
      id: `LEAD-${suffix()}`,
      department: somebody,
      kind: 'MODULE',
      name: 'Not theirs',
    }, lead.cookie)
    expect(theirsNot.status).toBe(403)
  })

  test('an expired assignment confers nothing, with no sweep having run (criterion 3)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const department = await addDepartment()
    await send('POST', `/api/admin/training/departments/${department}/leads`, { userId: lead.id })

    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE department_leads SET expires_at = 1 WHERE user_id = ?').run(lead.id)
    }
    finally {
      database.close()
    }

    const refused = await send('POST', '/api/admin/training/modules', {
      id: `LAPSED-${suffix()}`,
      department,
      kind: 'MODULE',
      name: 'After handover',
    }, lead.cookie)
    expect(refused.status).toBe(403)
  })

  test('removing a lead takes effect on their next request, and is audited (criteria 4 and 5)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const department = await addDepartment()
    const { id } = await (await send('POST', `/api/admin/training/departments/${department}/leads`, {
      userId: lead.id,
    })).json() as { id: string }

    expect((await send('DELETE', `/api/admin/training/leads/${id}`)).status).toBe(200)

    const refused = await send('POST', '/api/admin/training/modules', {
      id: `GONE-${suffix()}`,
      department,
      kind: 'MODULE',
      name: 'After standing down',
    }, lead.cookie)
    expect(refused.status).toBe(403)

    const entry = read<{ actor: string, detail: string }>(
      `SELECT actor_id actor, detail FROM audit_log WHERE action = 'department.lead.removed' AND target = ?`,
      `user:${lead.id}`,
    )
    expect(entry?.actor).toBe(officerId())
    expect(entry?.detail).toContain(department)
  })

  // The rule exists so a lead cannot move a module into a department they do not steward, which
  // would put it out of their own reach and into somebody else's (G-110 criterion 2).
  test('a lead may edit their department\'s modules, and may not move one out of it', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = await addDepartment()
    const somebody = await addDepartment()
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })

    const { id } = await (await addModule(theirs, { name: 'Theirs to steward' })).json() as { id: string }

    const edited = await send('PUT', `/api/admin/training/modules/${id}`, {
      department: theirs,
      kind: 'MODULE',
      name: 'Renamed by its lead',
      materials: [{ label: 'The manual', url: 'https://example.invalid/manual' }],
    }, lead.cookie)
    expect(edited.status).toBe(200)
    expect(read<{ n: number }>('SELECT count(*) n FROM module_materials WHERE module_id = ?', id)?.n).toBe(1)

    const moved = await send('PUT', `/api/admin/training/modules/${id}`, {
      department: somebody,
      kind: 'MODULE',
      name: 'Moved out of reach',
    }, lead.cookie)
    expect(moved.status).toBe(403)
    expect(read<{ department: string }>('SELECT department FROM modules WHERE id = ?', id)?.department)
      .toBe(theirs)
  })

  test('a lead reads the catalogue they may write, and sees only their own departments', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = await addDepartment()
    const somebody = await addDepartment()
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })
    await addModule(theirs, { name: 'Theirs' })
    await addModule(somebody, { name: 'Not theirs' })

    const listing = await send('GET', '/api/admin/training/modules', undefined, lead.cookie)
    expect(listing.status).toBe(200)
    const seen = (await listing.json() as { items: ModuleRow[] }).items
    expect(seen.every(one => one.department === theirs)).toBe(true)
    expect(seen.some(one => one.department === somebody)).toBe(false)

    const departments = await send('GET', '/api/admin/training/departments', undefined, lead.cookie)
    expect(departments.status).toBe(200)
    expect((await departments.json() as { items: { code: string }[] }).items.map(one => one.code))
      .toEqual([theirs])
  })

  // Stewarding a department is not appointing to it: a lead who could appoint could renew
  // themselves past handover, which is the thing the expiry exists to stop (G-110 criterion 3).
  test('a lead edits their catalogue but cannot appoint anybody, including themselves', async () => {
    const lead = await adminSession(app, { roles: [] })
    const department = await addDepartment()
    await send('POST', `/api/admin/training/departments/${department}/leads`, { userId: lead.id })

    expect((await send('POST', `/api/admin/training/departments/${department}/leads`, {
      userId: lead.id,
    }, lead.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a module declares its expiry policy once (G-123)', () => {
  test('each mode is stored as a policy and read back as a date (criteria 1 and 3)', async () => {
    const department = await addDepartment()
    const never = await (await addModule(department, { expiryMode: 'NONE' })).json() as { id: string }
    const months = await (await addModule(department, {
      expiryMode: 'MONTHS',
      expiryMonths: 24,
    })).json() as { id: string }
    const academic = await (await addModule(department, { expiryMode: 'ACADEMIC_YEAR' })).json() as { id: string }

    const items = await catalogue()
    expect(items.find(one => one.id === never.id)?.expiresIfAwardedToday).toBeNull()
    expect(items.find(one => one.id === months.id)?.expiresIfAwardedToday).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The configured boundary, and nothing stored: moving the setting moves this answer (0012),
    // so this reads the register rather than restating a number the committee may change.
    expect(items.find(one => one.id === academic.id)?.expiresIfAwardedToday)
      .toMatch(new RegExp(`-${CONFIG_KEYS.ACADEMIC_YEAR_BOUNDARY.default}$`))
  })

  test('no column anywhere holds a computed expiry or a validity (criterion 3)', async () => {
    const columns = new Database(app.databaseFile, { readonly: true })
    try {
      const names = columns.query(`SELECT name FROM pragma_table_info('modules')`).all() as { name: string }[]
      expect(names.map(column => column.name).filter(name => /expires_on|valid|standing/.test(name))).toEqual([])
    }
    finally {
      columns.close()
    }
  })

  test('a policy beyond the cap is refused (criterion 4)', async () => {
    const department = await addDepartment()
    expect((await addModule(department, { expiryMode: 'MONTHS', expiryMonths: 121 })).status).toBe(400)
    expect((await addModule(department, { expiryMode: 'MONTHS', expiryMonths: 120 })).status).toBe(200)
  })

  test('an impossible year boundary is refused at the config write (criterion 5)', async () => {
    const refused = await send('PUT', '/api/admin/config/ACADEMIC_YEAR_BOUNDARY', { value: '02-29' })
    expect(refused.status).toBe(400)
    expect((await send('PUT', '/api/admin/config/ACADEMIC_YEAR_BOUNDARY', { value: '13-01' })).status).toBe(400)
    expect((await send('PUT', '/api/admin/config/ACADEMIC_YEAR_BOUNDARY', { value: '07-31' })).status).toBe(200)
    // Put back what the register ships, so a later case in this file is not reading a boundary
    // this one left behind.
    await send('PUT', '/api/admin/config/ACADEMIC_YEAR_BOUNDARY', {
      value: CONFIG_KEYS.ACADEMIC_YEAR_BOUNDARY.default,
    })
  })
})

describe.skipIf(skip !== null)('the screen (G-107, G-110)', () => {
  test('a module is added through the catalogue screen', async () => {
    const department = await addDepartment()
    const view = await signedInView()
    const id = `SCREEN-${suffix()}`

    try {
      await visit(view, `${app.baseURL}/training/manage`, '[data-test="modules-table"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, '[data-test="add-module"]')
      await waitFor(view, `document.querySelector('[data-test="module-id"]')`, 30_000)
      await fill(view, '[data-test="module-id"]', id)
      await fill(view, '[data-test="module-name"]', 'Driving the desk')

      // Opened and picked by what it says: a Nuxt UI select is a listbox, so setting a value on
      // one does nothing at all. Every closed set on this form is a row of buttons instead.
      await click(view, `[data-test="module-department-${department}"]`)
      await click(view, '[data-test="module-kind-CERTIFICATION"]')
      await click(view, '[data-test="module-expiry-ACADEMIC_YEAR"]')
      await click(view, '[data-test="module-status-ACTIVE"]')
      await click(view, '[data-test="module-submit"]')

      await waitFor(view, `document.body.innerText.includes(${JSON.stringify(id)})`, 30_000)

      // The same screen reads the policy back as a date, computed on the way out of the request
      // rather than stored anywhere (G-123 criterion 3).
      expect(await textOf(view, 'body')).toContain('Earned today, it would run to')
    }
    finally {
      view.close()
    }

    const stored = read<{ kind: string, expiryMode: string, status: string }>(
      'SELECT kind, expiry_mode expiryMode, status FROM modules WHERE id = ?',
      id,
    )
    expect(stored).toMatchObject({ kind: 'CERTIFICATION', expiryMode: 'ACADEMIC_YEAR', status: 'ACTIVE' })
  }, CASE_TIMEOUT_MS)

  test('the departments screen renders and adds a department', async () => {
    const view = await signedInView()
    const code = `SCRN${suffix()}`

    try {
      await visit(view, `${app.baseURL}/training/manage/departments`, '[data-test="departments-table"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, '[data-test="add-department"]')
      await waitFor(view, `document.querySelector('[data-test="department-code"]')`, 30_000)
      await fill(view, '[data-test="department-code"]', code)
      await fill(view, '[data-test="department-name"]', 'Wardrobe')
      await click(view, '[data-test="department-submit"]')

      await waitFor(view, `document.body.innerText.includes(${JSON.stringify(code)})`, 30_000)
    }
    finally {
      view.close()
    }

    expect(read<{ name: string }>('SELECT name FROM departments WHERE code = ?', code)?.name).toBe('Wardrobe')
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
