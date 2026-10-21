import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// A show-night screen is a staff screen: somebody who never signed in is sent to sign in, as at
// the box office, and never served the door or the till under "Your sign-in has ended" (E-112).
const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
})

describe.skipIf(skip !== null)('a signed-out visitor to a show-night screen', () => {
  for (const path of ['/tonight', '/tonight/door', '/tonight/till', '/tonight/message', '/tonight/glance']) {
    test(`${path} sends them to sign in and back`, async () => {
      const answer = await fetch(`${app.baseURL}${path}`, { redirect: 'manual' })
      expect([302, 303, 307]).toContain(answer.status)
      const location = new URL(answer.headers.get('location') ?? '', app.baseURL)
      expect(location.pathname).toBe('/sign-in')
      expect(location.searchParams.get('next')).toBe(path)
    })
  }
})
