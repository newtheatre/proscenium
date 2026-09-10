import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession } from '#tests/helpers/accounts'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// J-110: a policy page quotes the live setting, changes the moment the setting does, marks a rule
// nothing enforces, and never renders a raw token (0012).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let cookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const setConfig = (key: string, value: unknown): Promise<Response> =>
  fetch(`${app.baseURL}/api/admin/config/${key}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'cookie': cookie },
    body: JSON.stringify({ value }),
  })

const pageHtml = async (path: string): Promise<string> => {
  const response = await fetch(`${app.baseURL}${path}`)
  expect(response.status).toBe(200)
  return response.text()
}

interface Values { values: Record<string, { text: string, enforced: boolean }> }

const valuesFor = async (path: string): Promise<Values> => {
  const response = await fetch(`${app.baseURL}/api/policies/values?path=${encodeURIComponent(path)}`)
  expect(response.status).toBe(200)
  return await response.json() as Values
}

describe.skipIf(skip !== null)('a policy page quotes the live setting (criteria 1, 2)', () => {
  test('the room policy renders the enforced value, not the token', async () => {
    const html = await pageHtml('/policies/rooms')
    expect(html).toContain('4 hours')
    expect(html).toContain('30 minutes')
    expect(html).not.toContain('{{')
  })

  // The whole point of 0012: the published rule and the enforced rule are one thing, so changing
  // the setting changes the page with nobody editing the markdown.
  test('changing the setting changes the page, with no content edit', async () => {
    try {
      expect((await setConfig('ROOM_MAX_BOOKING_HOURS', 6)).status).toBe(200)

      const html = await pageHtml('/policies/rooms')
      expect(html).toContain('6 hours')
      expect(html).not.toContain('4 hours')
    }
    finally {
      await setConfig('ROOM_MAX_BOOKING_HOURS', 4)
    }
  })

  test('a value of one reads singular, so the prose is not "1 hours"', async () => {
    try {
      await setConfig('ROOM_MAX_BOOKING_HOURS', 1)
      expect(await pageHtml('/policies/rooms')).toContain('1 hour')
    }
    finally {
      await setConfig('ROOM_MAX_BOOKING_HOURS', 4)
    }
  })

  test('each type is formatted for what it measures, not printed raw', async () => {
    const html = await pageHtml('/policies/rooms')
    // Weeks, a count, a boolean and a list, from one page.
    expect(html).toContain('12 weeks')
    expect(html).toContain('10</span>')
    expect(html).toContain('yes')
    expect(html).toContain('production, committee, rehearsal and general')
  })

  test('the editorial pages still render, carrying no tokens of their own', async () => {
    const html = await pageHtml('/about')
    expect(html).toContain('Awaiting committee copy')
    expect(html).not.toContain('policy-value')
  })
})

describe.skipIf(skip !== null)('a rule nothing enforces says so (criterion 5)', () => {
  test('the unpaid cancellation rule is quoted and marked as not enforced', async () => {
    const html = await pageHtml('/policies/booking')
    expect(html).toContain('policy-unenforced')
    expect(html).toContain('not enforced yet')
  })

  test('an enforced rule on the same page carries no such mark', async () => {
    const { values } = await valuesFor('/policies/booking')
    expect(values.REFUND_PAID_REQUIRES_MANAGER?.enforced).toBe(true)
    expect(values.REFUND_UNPAID_CANCELLATION_FREE?.enforced).toBe(false)
  })
})

describe.skipIf(skip !== null)('what a page may ask for (criterion 4)', () => {
  // Keyed on the page, so no caller can read a setting that page does not already publish.
  test('it answers only for the keys the page itself names', async () => {
    const { values } = await valuesFor('/policies/rooms')
    expect(Object.keys(values)).toContain('ROOM_MAX_BOOKING_HOURS')
    expect(Object.keys(values)).not.toContain('PASSWORD_MIN_LENGTH')
  })

  test('a page that does not exist is a 404, not an empty answer', async () => {
    const response = await fetch(`${app.baseURL}/api/policies/values?path=/policies/no-such-page`)
    expect(response.status).toBe(404)
  })

  test('a path that is not a path is refused', async () => {
    const response = await fetch(`${app.baseURL}/api/policies/values?path=../../etc/passwd`)
    expect(response.status).toBe(400)
  })

  // A visitor needs no account to read the rules they are being held to.
  test('the values endpoint needs no session', async () => {
    const { values } = await valuesFor('/policies/rooms')
    expect(values.ROOM_MAX_BOOKING_HOURS?.text).toBe('4 hours')
  })
})

describe.skipIf(skip !== null)('the pages are reachable (criterion 1)', () => {
  test('both policy pages are linked from the public navigation', async () => {
    const html = await pageHtml('/')
    expect(html).toContain('href="/policies/rooms"')
    expect(html).toContain('href="/policies/booking"')
  })
})
