import { describe, expect, test } from 'bun:test'
import { LAST_NIGHTS_BOARD, boardIsTonight } from '#shared/utils/backstage'

// Issue 1312: a board device belongs to the show night it joined, which ends at 04:00 London
// (0014), so a phone joined before 04:00 is refused after it. The route is in the e2e suite.

const source = (path: string): Promise<string> => Bun.file(path).text()

describe('a device is tonight\'s only until 04:00 (E-120, 0014)', () => {
  test('joined on the night of 16 October, it is that night\'s at 03:59 and not at 04:00 (BST)', () => {
    expect(boardIsTonight('2026-10-16', new Date('2026-10-17T02:59:59Z'))).toBe(true)
    expect(boardIsTonight('2026-10-16', new Date('2026-10-17T03:00:00Z'))).toBe(false)
  })

  test('the same edge in winter time, an hour later in UTC (GMT)', () => {
    expect(boardIsTonight('2026-11-06', new Date('2026-11-07T03:59:59Z'))).toBe(true)
    expect(boardIsTonight('2026-11-06', new Date('2026-11-07T04:00:00Z'))).toBe(false)
  })

  test('a device from tomorrow\'s night is not tonight\'s either', () => {
    expect(boardIsTonight('2026-10-17', new Date('2026-10-16T20:00:00Z'))).toBe(false)
  })

  test('the refusal says what happened and what to do', () => {
    expect(LAST_NIGHTS_BOARD).toBe('This board was for last night: join tonight\'s with the new code')
  })
})

describe('the guard and the screen (issue 1312)', () => {
  test('requireDevice refuses a device whose night is not tonight\'s, before anything else it checks', async () => {
    const guard = await source('server/utils/backstage.ts')
    const body = guard.slice(guard.indexOf('export async function requireDevice'))
    expect(body).toContain('if (!boardIsTonight(device.night)) throw createError({ statusCode: 401, statusMessage: LAST_NIGHTS_BOARD })')
    expect(body.indexOf('boardIsTonight')).toBeLessThan(body.indexOf('device.revokedAt'))
  })

  test('a refused phone shows the reason above the join form', async () => {
    const page = await source('app/pages/board/index.vue')
    expect(page).toContain('failure.value = refusalText(error)')
  })
})
