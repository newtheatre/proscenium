import { describe, expect, test } from 'bun:test'
import { ROTA_FLOW } from '#shared/utils/rota-flow'
import { sessionForm } from '#shared/utils/training'

// The rota and training console screens, read as source: one workflow that links itself, a board
// with a date window, module names on the pickers, and the grant beside the decline (item 10).

const read = (path: string): Promise<string> => Bun.file(path).text()

const TEMPLATES = 'app/pages/rota/manage/templates.vue'
const BOARD = 'app/pages/rota/manage/shifts.vue'
const OPENINGS = 'app/pages/rota/manage/openings.vue'
const APPROVALS = 'app/pages/rota/manage/approvals.vue'
const CLAIM_ANSWER = 'app/composables/useClaimAnswer.ts'
const DECLINE_MODAL = 'app/components/DeclineClaimModal.vue'
const RECORDS = 'app/pages/training/manage/records.vue'
const REQUESTS = 'app/pages/training/manage/requests.vue'
const SESSIONS = 'app/pages/training/manage/sessions/index.vue'

describe('each rota screen names the step after it (K-123 criterion 12)', () => {
  test('every screen in the flow carries the shared step link', async () => {
    for (const [path, step] of [[TEMPLATES, 'templates'], [BOARD, 'board'], [OPENINGS, 'openings']] as const) {
      expect(await read(path)).toContain(`<RotaFlow step="${step}"`)
    }
  })

  test('no screen hand-writes a link to another rota screen instead', async () => {
    const board = await read(BOARD)
    expect(board).not.toContain('to="/rota/manage/openings"')
  })

  test('the flow covers three of the rota group\'s sidebar entries', () => {
    expect(ROTA_FLOW).toHaveLength(3)
  })
})

// E-105 criteria 2 and 3: claims are confirmed and declined on the board; the old address forwards.
describe('the claims waiting for confirmation are worked on the board (E-105 criteria 2 and 3)', () => {
  test('the old approvals address forwards to the board\'s filter, and draws nothing of its own', async () => {
    const source = await read(APPROVALS)
    expect(source).toContain('navigateTo(BOARD_WAITING_HREF')
    expect(source).not.toContain('layout: \'console\'')
  })

  test('the board offers the filter, with how many claims are waiting', async () => {
    const source = await read(BOARD)
    expect(source).toContain('Waiting for confirmation')
    expect(source).toContain('data-test="board-waiting"')
  })

  test('a claim on the board can be declined with a reason, as well as confirmed', async () => {
    expect(await read(BOARD)).toContain(':data-test="`decline-${shift.shiftId}`"')
    expect(await read(CLAIM_ANSWER)).toContain('/decline`')
  })

  // The board and the openings screen answer a claim through one composable and one dialogue.
  test('a refused Confirm opens Decline with the route\'s reason, and a plain Decline starts empty', async () => {
    const answer = await read(CLAIM_ANSWER)
    expect(answer).toContain('refusalData<{ declineReason?: string }>(error)?.declineReason')
    expect(answer).toContain('openDecline(claim, offered)')
    expect(await read(DECLINE_MODAL)).toContain('if (isOpen) state.reason = props.offered')
    const board = await read(BOARD)
    expect(board).toContain('useClaimAnswer<RosterShift>(')
    expect(board).toContain('@click="openDecline(shift)"')
    expect(board).toContain(':offered="declineOffered"')
  })

  test('Confirm and Decline each work one at a time, so a double press never meets a 409', async () => {
    const source = await read(BOARD)
    expect(source).toContain(':loading="confirmingId === shift.shiftId"')
    expect(source).toContain(':loading="declineWorking"')
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

describe('the board shows bar openings beside performances (E-130 criterion 8)', () => {
  test('an opening card is marked as a bar opening', async () => {
    const source = await read(BOARD)
    expect(source).toContain(':data-test="`opening-${entry.openingId}`"')
    expect(source).toContain('Bar opening')
  })

  test('an opening links to its night on the openings screen rather than acting on the board', async () => {
    const source = await read(BOARD)
    expect(source).toContain('openingsOnNightHref(entry.night)')
    expect(source).toContain(':data-test="`manage-opening-${entry.openingId}`"')
  })

  test('the empty state names openings as well as performances', async () => {
    expect(await read(BOARD)).toContain('No performance or bar opening between')
  })
})

// E-130 criterion 3: with auto-confirm off a claim on an opening queues, and it is worked where the
// opening is staffed, with the reason a decline carries, as the board works a shift's.
describe('a queued claim on a bar opening is confirmed or declined on the openings screen', () => {
  test('a claimed slot offers Confirm and Decline, through the opening\'s own routes', async () => {
    const source = await read(OPENINGS)
    expect(source).toContain('useClaimAnswer<Slot>(')
    expect(source).toContain('route: slot => `/api/rota/openings/shifts/${slot.slotId}`')
    expect(source).toContain('`confirm-${slot.slotId}`')
    expect(source).toContain('`decline-${slot.slotId}`')
    const answer = await read(CLAIM_ANSWER)
    expect(answer).toContain('`${options.route(claim)}/approve`')
    expect(answer).toContain('`${options.route(claim)}/decline`')
  })

  test('a decline asks for the reason the claimant is shown, in the dialogue the board uses', async () => {
    expect(await read(OPENINGS)).toContain('<DeclineClaimModal')
    const modal = await read(DECLINE_MODAL)
    expect(modal).toContain(':schema="shiftDeclineForm"')
    expect(modal).toContain('data-test="decline-reason"')
  })

  test('a refused Confirm opens Decline with the route\'s reason, and a plain Decline starts empty', async () => {
    const source = await read(OPENINGS)
    expect(source).toContain(':offered="declineOffered"')
    expect(source).toContain('\'onClick\': () => openDecline(slot)')
  })

  test('Confirm and Decline each work one at a time, so a double press never meets a 409', async () => {
    const source = await read(OPENINGS)
    expect(source).toContain('\'loading\': confirmingId.value === slot.slotId')
    expect(source).toContain(':loading="declineWorking"')
    expect(await read(CLAIM_ANSWER)).toContain('if (confirmingId.value) return')
  })

  test('a claimed slot is answered rather than stood down', async () => {
    expect(await read(OPENINGS)).toContain('slot.status === \'CONFIRMED\' || slot.status === \'DECLINED\'')
  })
})

describe('a module is chosen by name (G-120 criterion 7)', () => {
  test('the sign-off picker names the module', async () => {
    const source = await read(RECORDS)
    expect(source).toMatch(/label: `\$\{module\.id\} \$\{module\.name\}`/)
    expect(source).toContain(':items="signableOptions"')
  })

  test('no picker on the records screen is a bare id', async () => {
    const source = await read(RECORDS)
    expect(source).not.toContain('{{ module.id }}')
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

const REGISTER = 'app/pages/training/sessions/[id]/register.vue'
const MY_TRAINING = 'app/pages/training/index.vue'

// Issue 1336: a trainer finds their own sessions where they look, and a register they may not open
// says why rather than claiming it could not be read (docs/copy-style.md sections 6 and 7).
describe('a trainer reaches the register of their own session', () => {
  test('My training lists the sessions they teach, each with the register one tap away', async () => {
    const source = await read(MY_TRAINING)
    expect(source).toContain('/api/training/teaching')
    expect(source).toContain('data-test="sessions-you-teach"')
    expect(source).toContain('Open the register')
  })

  test('the register\'s header names the session, not a bare date, and only once', async () => {
    const source = await read(REGISTER)
    expect(source).toContain('setNightSubject(() => ({ title: sessionTitle.value')
    expect(source).not.toContain('<h1')
  })

  test('a refused read shows the refusal it was given', async () => {
    const source = await read(REGISTER)
    expect(source).toContain('useListFailure(error')
    expect(source).toContain('data-test="register-read-failed"')
  })

  test('the session page shows the refusal it was given too', async () => {
    const source = await read('app/pages/training/manage/sessions/[id].vue')
    expect(source).toContain('useListFailure(error')
    expect(source).toContain(':title="readFailure.message"')
    expect(source).not.toContain('title="That session could not be read"')
  })

  test('a failed read of the sessions you teach is shown, not taken for none', async () => {
    const source = await read(MY_TRAINING)
    expect(source).toContain('useListFailure(teachingError')
    expect(source).toContain('v-if="teachingFailure || teaching.items.length > 0"')
  })
})

describe('the scheduler names who teaches (G-112, issue 1336)', () => {
  const session = { heldOn: '2026-10-08', startsAt: '19:00', endsAt: '21:00', capacity: 12, moduleIds: ['SFTY-001'] }

  test('the form takes a trainer, and none named means the scheduler', () => {
    expect(sessionForm.parse({ ...session, trainerId: 'aoife' }).trainerId).toBe('aoife')
    expect(sessionForm.parse(session).trainerId).toBeNull()
  })

  test('the scheduling dialogue carries a Taught by picker', async () => {
    const source = await read(SESSIONS)
    expect(source).toContain('Taught by')
    expect(source).toContain('data-test="session-trainer"')
  })
})
