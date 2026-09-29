import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, finishSignIn, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { clearConfigOverride, overrideConfig } from '#tests/helpers/config'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// /money, /money/periods and /money/exports (I-105, I-107, I-108): each screen's own flow, from
// the dashboard's period picker to a typed confirmation before a reopen.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let treasurer: TestMember
let boxOffice: TestMember
let committee: TestMember
const treasurerPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  treasurer = await registerMember(app, 'screens-treasurer', treasurerPassword)
  boxOffice = await registerMember(app, 'screens-box-office', generatePassword())
  committee = await registerMember(app, 'screens-committee', generatePassword())
  await grantRole(app, treasurer, 'TREASURER', admin.cookie)
  await grantRole(app, boxOffice, 'FOH_MANAGER', admin.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: committee.id, role: 'COMMITTEE' }, admin.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body: unknown, as: string): Promise<Response> =>
  request(app, method, path, body, as)

function zReading(night: string, variancePence: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      INSERT INTO z_readings (id, night, reader_pence, expected_pence, variance_pence, entered_by, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`screens-z-${night}`, night, 1000 + variancePence, 1000, variancePence, treasurer.id, variancePence === 0 ? null : 'The float was miscounted')
  }
  finally {
    database.close()
  }
}

function seasonRow(id: string, name: string, startsOn: string, endsOn: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO seasons (id, name, starts_on, ends_on, sort, archived) VALUES (?, ?, ?, ?, 0, 0)').run(id, name, startsOn, endsOn)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('/money: the dashboard over one of the theatre\'s seasons (0087)', () => {
  test('the finance roles list the seasons, box office reads them only from its own screens', async () => {
    seasonRow('screens-season-autumn', 'Autumn 2018 (screens)', '2018-09-24', '2018-12-14')
    const listed = await send('GET', '/api/admin/finance/seasons', undefined, committee.cookie)
    expect(listed.status).toBe(200)
    const { seasons } = await listed.json() as { seasons: { id: string, name: string, fromDay: string, toDay: string }[] }
    expect(seasons).toContainEqual({ id: 'screens-season-autumn', name: 'Autumn 2018 (screens)', fromDay: '2018-09-24', toDay: '2018-12-14' })
    expect((await send('GET', '/api/admin/finance/seasons', undefined, boxOffice.cookie)).status).toBe(403)
  })

  test('the summary answers a season as the days its row carries', async () => {
    seasonRow('screens-season-stuff', 'StuFF 2019 (screens)', '2019-05-13', '2019-05-19')
    const answered = await send('GET', '/api/admin/finance/season?kind=SEASON&seasonId=screens-season-stuff', undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    const { summary } = await answered.json() as { summary: { fromDay: string, toDay: string, revenueTotalPence: number, revenueBySource: { totalPence: number }[] } }
    expect(summary).toMatchObject({ fromDay: '2019-05-13', toDay: '2019-05-19' })
    // The total row's figure arrives with the rows and equals them.
    expect(summary.revenueTotalPence).toBe(summary.revenueBySource.reduce((sum, row) => sum + row.totalPence, 0))
  })

  test('a season no row carries is refused rather than read as some other range', async () => {
    expect((await send('GET', '/api/admin/finance/season?kind=SEASON&seasonId=screens-season-nobody', undefined, treasurer.cookie)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('/money/periods: the preview shown before closing (I-107 criterion 5)', () => {
  test('a clear range previews with nothing blocking, and the treasurer closes it', async () => {
    const fromDay = '2019-01-01'
    const toDay = '2019-01-31'

    const preview = await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, treasurer.cookie)
    expect(preview.status).toBe(200)
    const body = await preview.json() as { unreconciledNights: string[], openVarianceNights: string[] }
    expect(body.unreconciledNights).toEqual([])
    expect(body.openVarianceNights).toEqual([])

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay, label: 'January 2019' }, treasurer.cookie)
    expect(closed.status).toBe(200)
  })

  test('an open variance inside the range is named in the preview, and closing still succeeds around it', async () => {
    const fromDay = '2019-02-01'
    const toDay = '2019-02-28'
    zReading('2019-02-15', 50)

    const preview = await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, treasurer.cookie)
    const body = await preview.json() as { openVarianceNights: string[] }
    expect(body.openVarianceNights).toContain('2019-02-15')

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, treasurer.cookie)
    expect(closed.status).toBe(200)
  })

  test('box office holds neither finance.read nor finance.write: refused at preview and close', async () => {
    const fromDay = '2019-03-01'
    const toDay = '2019-03-31'
    expect((await send('POST', '/api/admin/finance/periods/preview', { fromDay, toDay }, boxOffice.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, boxOffice.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('/money/periods: reopening with the range typed back (I-107 criterion 4)', () => {
  test('the treasurer closes, box office cannot reopen, and an administrator reopens with the matching range', async () => {
    const fromDay = '2019-04-01'
    const toDay = '2019-04-30'
    const closed = await send('POST', '/api/admin/finance/periods', { fromDay, toDay }, treasurer.cookie)
    const { id: lockId } = await closed.json() as { id: string }

    expect((await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: fromDay, confirmToDay: toDay }, boxOffice.cookie)).status).toBe(403)

    const reopened = await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: fromDay, confirmToDay: toDay }, admin.cookie)
    expect(reopened.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('/money/exports: editing a mapping before the CSV reads it (I-108 criteria 1, 2, 3)', () => {
  test('the treasurer edits the mapping and the export carries it, with a proper header row', async () => {
    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
        VALUES ('screens-e1', unixepoch(), '2019-05-10', 'DESK', 'CARD', ?, 900)
      `).run(treasurer.id)
      database.query(`
        INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES ('screens-l1', 'screens-e1', 'WALK_UP', 900)
      `).run()
    }
    finally {
      database.close()
    }

    const edited = await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '4150' }, treasurer.cookie)
    expect(edited.status).toBe(200)

    const exported = await send('GET', '/api/admin/finance/export?fromDay=2019-05-01&toDay=2019-05-31', undefined, treasurer.cookie)
    expect(exported.status).toBe(200)
    const csv = await exported.text()
    const [header, ...rows] = csv.trim().split('\r\n')
    expect(header).toBe('"date","category","tender","nominalCode","amountPence","amountPounds"')
    expect(rows.some(row => row.includes('"4150"'))).toBe(true)
  })

  test('box office holds neither finance.write nor finance.export: refused editing and downloading', async () => {
    expect((await send('POST', '/api/admin/finance/nominal-mappings', { kind: 'WALK_UP', source: 'DESK', nominalCode: '9999' }, boxOffice.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/finance/export?fromDay=2019-05-01&toDay=2019-05-31', undefined, boxOffice.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('/money: the dashboard over a defined term (I-105 criterion 4)', () => {
  test('the committee may list the terms the picker offers, box office may not', async () => {
    expect((await send('GET', '/api/admin/finance/terms', undefined, committee.cookie)).status).toBe(200)
    expect((await send('GET', '/api/admin/finance/terms', undefined, boxOffice.cookie)).status).toBe(403)
  })

  test('the whole year is asked for as a year, and a season named by a year is refused (0087)', async () => {
    expect((await send('GET', '/api/admin/finance/season?kind=YEAR&year=2020', undefined, treasurer.cookie)).status).toBe(200)
    expect((await send('GET', '/api/admin/finance/season?kind=SEASON&year=2020', undefined, treasurer.cookie)).status).toBe(400)
  })

  test('the summary answers a term as the range the term itself carries', async () => {
    const defined = await send('POST', '/api/admin/finance/terms', { label: 'Autumn 2019', fromDay: '2019-09-23', toDay: '2019-12-13' }, treasurer.cookie)
    expect(defined.status).toBe(200)

    const answered = await send('GET', '/api/admin/finance/season?kind=TERM&fromDay=2019-09-23&toDay=2019-12-13', undefined, treasurer.cookie)
    expect(answered.status).toBe(200)
    const { summary } = await answered.json() as { summary: { fromDay: string, toDay: string } }
    expect(summary).toMatchObject({ fromDay: '2019-09-23', toDay: '2019-12-13' })
  })

  test('the screen offers the term, and its money column is headed Amount rather than Pence', async () => {
    await send('POST', '/api/admin/finance/terms', { label: 'Spring 2020', fromDay: '2020-01-13', toDay: '2020-03-27' }, treasurer.cookie)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', treasurer.email)
    await fill(view, 'form input[type="password"]', treasurerPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, treasurer.email)

    await visit(view, `${app.baseURL}/money`, '[data-test="period-kind"]')
    await waitFor(view, `document.querySelector('[data-test="section-revenue"]')`)
    expect(await textOf(view, '[data-test="section-revenue"] thead')).toContain('Amount')
    expect(await textOf(view, '[data-test="section-revenue"] thead')).not.toContain('Pence')

    await pickOption(view, '[data-test="period-kind"]', 'TERM')
    await pickOption(view, '[data-test="period-term"]', 'Spring 2020')
    await waitFor(view, `document.body.innerText.includes('2020-01-13 to 2020-03-27')`)

    await visit(view, `${app.baseURL}/money/periods`, '[data-test="defined-terms"]')
    expect(await textOf(view, '[data-test="defined-terms"]')).toContain('Spring 2020: 2020-01-13 to 2020-03-27')
    view.close()
  }, 120_000)
})

// Issue 1361: one entry opened, with the people on it, to the finance readers alone (I-105 c5).
// Dated outside the closed months above, since a closed period refuses the insert (I-107).
describe.skipIf(skip !== null)('/money/entries: opening one entry', () => {
  test('the Treasurer opens an entry and its lines; the committee cannot; an unknown one is a 404', async () => {
    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, total_pence) VALUES (?, ?, ?, ?, ?, ?)')
        .run('screens-e2', '2019-06-10', 'TILL', 'CARD', Math.floor(Date.UTC(2019, 5, 10, 20) / 1000), 400)
      database.query('INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, discount_pence, discount_percent) VALUES (?, ?, ?, ?, ?, ?)')
        .run('screens-l2', 'screens-e2', 'BAR_ITEM', 400, 100, 20)
    }
    finally {
      database.close()
    }
    // The Treasurer here holds no authenticator, and A-112 is not what this proves.
    overrideConfig(app, 'PRIVILEGED_ROLES', ['ADMIN'])
    try {
      const opened = await send('GET', '/api/admin/finance/season/entries/screens-e2', undefined, treasurer.cookie)
      expect(opened.status).toBe(200)
      expect(await opened.json()).toMatchObject({ id: 'screens-e2', lines: [{ kind: 'BAR_ITEM', discountPence: 100, discountPercent: 20 }] })

      expect((await send('GET', '/api/admin/finance/season/entries/screens-e2', undefined, committee.cookie)).status).toBe(403)
      expect((await send('GET', '/api/admin/finance/season/entries/screens-no-such-entry', undefined, treasurer.cookie)).status).toBe(404)
    }
    finally {
      clearConfigOverride(app, 'PRIVILEGED_ROLES')
    }
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
