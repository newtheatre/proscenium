import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, grantRole, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { signInView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// 0256: Ctrl+K holds the viewer's sidebar and sends typed words to the lists that search by them.
// `tests/unit/quick-jump.test.ts` holds the palette to the sidebar for every role.
const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let view: Bun.WebView

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  const password = generatePassword()
  const theatre = await registerMember(app, 'palette', password)
  expect((await grantRole(app, theatre, 'THEATRE_MANAGER', officer.cookie)).status).toBe(200)
  view = await signInView(app, theatre.email, password)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  view?.close()
  await app?.stop()
}, 30_000)

const OPENER = '[data-test="quick-jump-open"]'

// By the start of its words, so "Accounts matching Audit trail" is not taken for the screen.
const option = (text: string): string =>
  `[...document.querySelectorAll('[role="dialog"] [role="option"]')].find(el => el.innerText.trim().startsWith(${JSON.stringify(text)}))`

async function palette(typed: string): Promise<void> {
  if (!await view.evaluate<boolean>(`Boolean(document.querySelector('[role="dialog"] input'))`)) {
    await view.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`)
    await waitFor(view, `document.querySelector('[role="dialog"] input')`)
  }
  await view.evaluate(`(() => {
    const field = document.querySelector('[role="dialog"] input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(typed)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}

describe.skipIf(skip !== null)('Ctrl+K goes to any screen the sidebar offers (0256)', () => {
  test('a screen is opened by its name, and one the viewer cannot open is not offered', async () => {
    await visit(view, `${app.baseURL}/rooms/manage`, OPENER)
    await palette('Audit trail')
    await waitFor(view, `Boolean(${option('Accounts matching Audit trail')})`)
    expect(await view.evaluate<boolean>(`Boolean(${option('Audit trail')})`)).toBe(false)
    expect(await view.evaluate<string>(`document.querySelector('[role="dialog"]').innerText`)).not.toContain('dashboardSearch.')
    await palette('Closures')
    await waitFor(view, `Boolean(${option('Closures')})`)
    await view.evaluate(`${option('Closures')}.click()`)
    await waitFor(view, `location.pathname === '/rooms/manage/closures' && !document.querySelector('[role="dialog"] input')`)
  }, 120_000)

  test('the sidebar button opens it too', async () => {
    await visit(view, `${app.baseURL}/rooms/manage`, OPENER)
    await view.evaluate(`document.querySelector('${OPENER}').click()`)
    await waitFor(view, `document.querySelector('[role="dialog"] input')`)
    await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  }, 120_000)

  test('a typed name opens the accounts list already searched', async () => {
    await visit(view, `${app.baseURL}/people/accounts`, OPENER)
    await palette('Spotlight')
    await waitFor(view, `Boolean(${option('Accounts matching Spotlight')})`)
    // A Theatre Manager reads no programme, so Shows is not offered to search.
    expect(await view.evaluate<boolean>(`Boolean(${option('Shows matching Spotlight')})`)).toBe(false)
    await view.evaluate(`${option('Accounts matching Spotlight')}.click()`)
    await waitFor(view, `location.pathname === '/people/accounts' && new URLSearchParams(location.search).get('search') === 'Spotlight'`)
  }, 120_000)
})
