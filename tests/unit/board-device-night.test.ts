import { describe, expect, test } from 'bun:test'
import { LAST_NIGHTS_BOARD } from '#shared/utils/backstage'

// Issue 1312: a board device belongs to the show night it joined, which ends at 04:00 London
// (0014), so a phone joined before 04:00 is refused after it. The route is in the e2e suite.

const source = (path: string): Promise<string> => Bun.file(path).text()

// The body of one function in a source file, from its declaration to the next top-level one.
function body(text: string, start: string, end: string): string {
  return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start) + start.length))
}

describe('the guard (issue 1312)', () => {
  test('the refusal says what happened and what to do', () => {
    expect(LAST_NIGHTS_BOARD).toBe('This board was for last night: join tonight\'s with the new code')
  })

  test('requireDevice refuses a device whose night is not tonight\'s, before the reset check', async () => {
    const guard = body(await source('server/utils/backstage.ts'), 'export async function requireDevice', '\n}\n')
    expect(guard).toContain('if (device.night !== currentShowNight()) throw createError({ statusCode: 401, statusMessage: LAST_NIGHTS_BOARD })')
    expect(guard.indexOf('currentShowNight')).toBeLessThan(guard.indexOf('device.revokedAt'))
  })
})

describe('the board screen drops a refused device, reopened or open (issue 1312)', () => {
  test('dropping one clears the cookie, stops the poll and shows the join form with the reason', async () => {
    const drop = body(await source('app/pages/board/index.vue'), 'function dropDevice', '\n}\n')
    expect(drop).toContain('deviceToken.value = null')
    expect(drop).toContain('joined.value = null')
    expect(drop).toContain('failure.value = refusalText(error)')
    expect(drop).toContain('clearInterval(timer)')
  })

  test('both a reopened phone and a board left open overnight drop the device on a 401', async () => {
    const page = await source('app/pages/board/index.vue')
    for (const reader of ['async function resume', 'async function loadMessages']) {
      expect(body(page, reader, '\n}\n')).toMatch(/refusalStatus\(error\) === 401\)\s*(?:\{\s*)?dropDevice\(error\)/)
    }
  })
})
