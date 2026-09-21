import { describe, expect, test } from 'bun:test'
import { ROTA_FLOW } from '#shared/utils/rota-flow'

// The rota and training console screens, read as source: one workflow that links itself, a board
// with a date window, module names on the pickers, and the grant beside the decline (issue 1151
// item 10). What the routes do is proved in `tests/integration`.

const read = (path: string): Promise<string> => Bun.file(path).text()

const TEMPLATES = 'app/pages/rota/manage/templates.vue'
const BOARD = 'app/pages/rota/manage/shifts.vue'
const OPENINGS = 'app/pages/rota/manage/openings.vue'
const APPROVALS = 'app/pages/rota/manage/approvals.vue'
const RECORDS = 'app/pages/training/manage/records.vue'
const REQUESTS = 'app/pages/training/manage/requests.vue'
const SESSIONS = 'app/pages/training/manage/sessions/index.vue'

describe('each rota screen names the step after it (K-123 criterion 12)', () => {
  test('every screen in the flow carries the shared step link', async () => {
    for (const [path, step] of [[TEMPLATES, 'templates'], [BOARD, 'board'], [OPENINGS, 'openings'], [APPROVALS, 'approvals']] as const) {
      expect(await read(path)).toContain(`<RotaFlow step="${step}"`)
    }
  })

  test('no screen hand-writes a link to another rota screen instead', async () => {
    const board = await read(BOARD)
    expect(board).not.toContain('to="/rota/manage/openings"')
  })

  test('the flow covers four of the rota group\'s sidebar entries', () => {
    expect(ROTA_FLOW).toHaveLength(4)
  })
})

describe('the board shows the nights it was asked for (E-107 criterion 7)', () => {
  test('the board sends a window with its read', async () => {
    const source = await read(BOARD)
    expect(source).toContain('defaultBoardWindow')
    expect(source).toContain('window.from')
    expect(source).toContain('window.to')
  })

  test('the window is two date fields in the toolbar, as a span is everywhere else', async () => {
    const source = await read(BOARD)
    expect(source).toContain('data-test="board-from"')
    expect(source).toContain('data-test="board-until"')
    expect(source).toContain('<AdminToolbar')
  })

  test('the empty state says what the window would hold, not that nothing is stamped', async () => {
    const source = await read(BOARD)
    expect(source).not.toContain('Nothing is stamped for a performance yet.')
    expect(source).toContain('data-test="board-empty"')
  })
})

describe('a module is chosen by name (G-120 criterion 7)', () => {
  test('the sign-off picker names the module', async () => {
    const source = await read(RECORDS)
    expect(source).toContain('{{ module.name }}')
  })

  test('no picker on the records screen is a bare id', async () => {
    const source = await read(RECORDS)
    expect(source).not.toContain('>\n            {{ module.id }}\n          </UButton>')
  })

  test('revoking names the module rather than its id', async () => {
    expect(await read(RECORDS)).not.toContain('Revoke ${revoking.moduleId}')
  })
})

describe('the demand board offers the grant (G-104 criterion 7)', () => {
  test('every module on the board links to scheduling a session for it', async () => {
    const source = await read(REQUESTS)
    expect(source).toContain('/training/manage/sessions?module=')
    expect(source).toContain('Schedule a session')
  })

  test('the answer to a request is not only a decline', async () => {
    const source = await read(REQUESTS)
    expect(source).toContain(':data-test="`schedule-${demand.moduleId}`"')
  })

  test('the sessions screen opens on the module it was sent', async () => {
    const source = await read(SESSIONS)
    expect(source).toContain('route.query.module')
  })
})
