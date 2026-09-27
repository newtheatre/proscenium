import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { letters, skipReason, startApp } from '#tests/helpers/webview'
import { clearConfigOverride, overrideConfig } from '#tests/helpers/config'
import { showNightOf } from '#shared/utils/show-night'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-125 through the real task and the real routes it feeds. The candidate query and the
// deadline are pinned in tests/integration and tests/unit; this is the guard and the wiring.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

// The sweep starts from a named night (E-125 as amended): a week before any night these cases use.
const FROM_NIGHT = showNightOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  overrideConfig(app, 'AUTO_CLOSE_FROM_NIGHT', FROM_NIGHT)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function read<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

function withBatch<T>(fn: (runner: { batch: (statements: [string, ...unknown[]][]) => void }) => T): T {
  const database = new Database(app.databaseFile)
  try {
    return fn({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    })
  }
  finally {
    database.close()
  }
}

async function runCloseTask(): Promise<void> {
  expect((await fetch(`${app.baseURL}/_nitro/tasks/nights:close`, { method: 'POST' })).status).toBe(200)
}

async function mailboxSubjectFor(recipient: string): Promise<string | undefined> {
  const message = (await letters(app)).find(text => text.startsWith(`To: ${recipient}`))
  return message?.split('\n').find(line => line.startsWith('Subject: '))?.slice('Subject: '.length)
}

// Well past its own 24-hour window however long the suite takes to run.
const OLD_NIGHT = showNightOf(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))

// At cutover the import brings years of performances with no report, and none of them may be
// frozen and mailed by the sweep (E-125 criterion 1 as amended).
describe.skipIf(skip !== null)('imported history is never closed automatically (criterion 1 as amended)', () => {
  test('a performance before the first night is left alone', async () => {
    const IMPORTED_NIGHT = showNightOf(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { night: IMPORTED_NIGHT, suffix: `auto-close-imported-${crypto.randomUUID().slice(0, 8)}` }))

    await runCloseTask()

    expect(read('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)).toHaveLength(0)
  })

  test('with no first night set, nothing closes itself', async () => {
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix: `auto-close-unset-${crypto.randomUUID().slice(0, 8)}` }))
    clearConfigOverride(app, 'AUTO_CLOSE_FROM_NIGHT')
    try {
      await runCloseTask()
    }
    finally {
      overrideConfig(app, 'AUTO_CLOSE_FROM_NIGHT', FROM_NIGHT)
    }

    expect(read('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)).toHaveLength(0)
  })
})

describe.skipIf(skip !== null)('auto-close within 24 hours (criteria 1, 2, 4)', () => {
  test('an unclosed performance freezes itself as SYSTEM, with no signatory', async () => {
    const suffix = `auto-close-${crypto.randomUUID().slice(0, 8)}`
    const { performanceId, venueId } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix }))
    write(`INSERT INTO checklist_items (id, venue_id, phase, label, sort, required) VALUES (?, ?, 'PRE', 'Fire exits checked', 1, 1)`,
      `item-${suffix}`, venueId)

    await runCloseTask()

    const [report] = read<{ id: string, signed_by: string | null, signed_via: string, closing_note: string }>(
      'SELECT id, signed_by, signed_via, closing_note FROM night_reports WHERE performance_id = ?', performanceId,
    )
    expect(report).toMatchObject({ signed_by: null, signed_via: 'SYSTEM' })
    expect(report.closing_note.length).toBeGreaterThan(0)

    const compiled = JSON.parse(read<{ report: string }>('SELECT report FROM night_reports WHERE id = ?', report.id)[0]!.report) as
      { checklist: { itemId: string, done: boolean, exempted: boolean }[] }
    expect(compiled.checklist.some(entry => !entry.done && !entry.exempted)).toBe(true)
  })

  // Nobody closed it, so SYSTEM writes no close row and reviews no incident; the report lists what
  // was left, and the checklist reads the report as the night's close (E-125 criterion 2).
  test('the automatic close writes no close and no review, and its report keeps what was left', async () => {
    const reporter = await registerMember(app, 'auto-close-reporter', generatePassword())
    const suffix = `auto-close-left-${crypto.randomUUID().slice(0, 8)}`
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix }))
    write(`INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, 'SAFETY', 'NOTE', 'A spill')`,
      `incident-${suffix}`, performanceId, reporter.id)

    await runCloseTask()

    expect(read('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)).toHaveLength(1)
    expect(read('SELECT id FROM checklist_closes WHERE performance_id = ?', performanceId)).toEqual([])
    expect(read(`SELECT id FROM audit_log WHERE action = 'incident.reviewed' AND target = ?`, `incident:incident-${suffix}`)).toEqual([])
    const [frozen] = read<{ report: string }>('SELECT report FROM night_reports WHERE performance_id = ?', performanceId)
    expect((JSON.parse(frozen!.report) as { incidents: { id: string }[] }).incidents.map(one => one.id)).toContain(`incident-${suffix}`)
  })

  test('re-running the task never produces a second report (criterion 4)', async () => {
    const suffix = `auto-close-idempotent-${crypto.randomUUID().slice(0, 8)}`
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix }))

    await runCloseTask()
    await runCloseTask()

    const rows = read<{ id: string }>('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)
    expect(rows).toHaveLength(1)
  })

  test('a performance signed off by a human is left alone', async () => {
    const dm = await registerMember(app, 'auto-close-human-dm', generatePassword())
    const suffix = `auto-close-human-${crypto.randomUUID().slice(0, 8)}`
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix }))
    write('INSERT INTO night_reports (id, performance_id, venue_id, night, closing_note, report, signed_by, signed_via) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      `report-human-${suffix}`, performanceId, venueId, night, 'All fine', '{}', dm.id, 'SHIFT')

    await runCloseTask()

    const rows = read<{ signed_via: string }>('SELECT signed_via FROM night_reports WHERE performance_id = ?', performanceId)
    expect(rows).toEqual([{ signed_via: 'SHIFT' }])
  })

  test('distributes under a distinct subject line and notifies whoever holds night.manage (criterion 3)', async () => {
    const officer = await registerMember(app, 'auto-close-officer', generatePassword())
    await fetch(`${app.baseURL}/api/admin/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': admin.cookie },
      body: JSON.stringify({ userId: officer.id, role: 'FOH_MANAGER' }),
    })
    // The standing list names a role, and the report reaches whoever holds it (issue 1356).
    const standing = await registerMember(app, 'auto-close-standing', generatePassword())
    await fetch(`${app.baseURL}/api/admin/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': admin.cookie },
      body: JSON.stringify({ userId: standing.id, role: 'SAFETY_OFFICER' }),
    })
    const recipient = standing.email
    const stored = await fetch(`${app.baseURL}/api/admin/config/NIGHT_REPORT_ROLES`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'cookie': admin.cookie },
      body: JSON.stringify({ value: ['SAFETY_OFFICER'] }),
    })
    expect(stored.status).toBe(200)

    const suffix = `auto-close-officer-${crypto.randomUUID().slice(0, 8)}`
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { night: OLD_NIGHT, suffix }))

    try {
      await runCloseTask()

      const [reportRow] = read<{ id: string }>('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)
      const deliveries = read<{ recipient: string, status: string }>(
        'SELECT recipient, status FROM night_report_deliveries WHERE report_id = ?', reportRow!.id,
      )
      expect(deliveries).toContainEqual({ recipient, status: 'SENT' })
      expect(await mailboxSubjectFor(recipient)).toMatch(/auto-closed/i)

      const notified = read<{ id: string }>(
        `SELECT id FROM notification_log WHERE user_id = ? AND type = 'night.auto-closed'`, officer.id,
      )
      expect(notified.length).toBeGreaterThan(0)
      expect(await mailboxSubjectFor(officer.email)).toMatch(/unclosed night/i)
    }
    finally {
      write('DELETE FROM config WHERE key = ?', 'NIGHT_REPORT_ROLES')
    }
  })
})
