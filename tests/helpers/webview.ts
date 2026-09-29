import { statSync } from 'node:fs'
import { NIGHT_DRAWN_CHOICE } from '#shared/utils/night-shell'
import { hubDirFor } from './hub-dir'
import { resetDatabase } from './reset-database'
import { createServerLog, readServerLog } from './server-log'
import type { Subprocess } from 'bun'

// Bun.WebView's default backend is WKWebView, which is macOS only. Everything else drives
// Chrome over the DevTools protocol (0022).
const BACKEND = process.platform === 'darwin' ? 'webkit' : 'chrome'
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3101'
const READY_TIMEOUT_MS = 120_000

// Probing beats guessing: Bun.WebView finds Chrome in standard locations whether or not it is
// on PATH, so only opening one tells the truth about whether the suite can run.
let probed: string | null | undefined

// A suite with no browser must say so. Reporting a skip is honest; passing is not.
export function skipReason(): string | null {
  if (probed !== undefined) return probed
  const before = profileDirectories()
  try {
    new Bun.WebView({ backend: BACKEND }).close()
    claimProfilesSince(before)
    probed = null
  }
  catch (error) {
    probed = `no usable ${BACKEND} backend for Bun.WebView: install Chrome or set BUN_CHROME_PATH (${error instanceof Error ? error.message : String(error)})`
  }
  return probed
}

async function waitForServer(url: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('server start aborted')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return
    }
    catch { /* not up yet */ }
    await Bun.sleep(250)
  }
  throw new Error(`server at ${url} did not become ready within ${READY_TIMEOUT_MS}ms`)
}

function portIsFree(port: string): boolean {
  try {
    const probe = Bun.listen({ hostname: '127.0.0.1', port: Number(port), socket: { data() {} } })
    probe.stop(true)
    return true
  }
  catch {
    return false
  }
}

// A held port is this app's if it answers this app's health route. Anything else is somebody
// else's server, and talking to it would be worse than refusing.
async function alreadyServing(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
    return 'sessionKey' in (await response.json() as Record<string, unknown>)
  }
  catch {
    return false
  }
}

export interface AppUnderTest {
  baseURL: string
  databaseFile: string
  // Where a development send is written instead of being sent. Beside the database, because the
  // server reads the same `NUXT_HUB_DIR` for both (`server/utils/mailbox.ts`).
  mailDir: string
  // Everything the dev server wrote, stdout and stderr both: never discarded (docs/known-issues.md).
  logTail: () => Promise<string>
  stop: () => Promise<void>
}

// Every message the development transport wrote: the log records the outcome, never the content.
// An unwritten mailbox reads as none, so an assertion fails plainly rather than as a glob's stack.
export async function letters(app: AppUnderTest): Promise<string[]> {
  try {
    const names = [...new Bun.Glob('*.txt').scanSync({ cwd: app.mailDir, onlyFiles: true })]
    return await Promise.all(names.map(name => Bun.file(`${app.mailDir}/${name}`).text()))
  }
  catch {
    return []
  }
}

// Bun buffers a file's console output until the file ends, so a run has no live progress at all.
// Written straight to the descriptor, this is the one line that escapes that.
function announce(suite: string, started: number, since: number): void {
  const minutes = Math.floor((Date.now() - since) / 60_000)
  const seconds = Math.floor(((Date.now() - since) % 60_000) / 1000)
  const total = [...new Bun.Glob('*.test.ts').scanSync({ cwd: 'tests/e2e' })].length
  Bun.write(Bun.stderr, `[e2e] ${started}/${total} ${suite} (${minutes}m${String(seconds).padStart(2, '0')}s in)\n`)
}

// The suite is not something bun hands us, and naming it is worth one stack read: a run that says
// only "still going" tells nobody which suite is the slow one.
function callingSuite(): string {
  const frame = new Error('locate the suite').stack?.split('\n').find(line => line.includes('tests/e2e/'))
  return frame?.match(/tests\/e2e\/([\w.-]+)\.test\.ts/)?.[1] ?? 'a suite'
}

let suitesStarted = 0
const runBegan = Date.now()

// Every suite in a shard shares one server, because booting one costs fifteen seconds and bun
// runs a shard's files in a single process. Isolation is the database, not the server (0022).
let shared: { app: AppUnderTest, server: Subprocess | null, controller: AbortController } | null = null

// Its own database per suite, inside the gitignored .data: sharing one lets a suite depend on what
// the last one left, which is how "the last administrator" stops being true mid-run.
export async function startApp(): Promise<AppUnderTest> {
  announce(callingSuite(), ++suitesStarted, runBegan)
  removeStaleProfiles()

  if (shared) {
    await resetDatabase(shared.app.databaseFile)
    return shared.app
  }

  const controller = new AbortController()
  const port = new URL(BASE_URL).port
  // A stable path, wiped on the way in rather than out: a crashed run leaves nothing behind.
  const hubDir = hubDirFor(port)

  // Adopted, not replaced, and asked over HTTP: a server on ::1 alone leaves 127.0.0.1 bindable,
  // and booting past it wipes the directory it is serving from.
  const serving = await alreadyServing()
  if (serving || !portIsFree(port)) {
    if (!serving) {
      throw new Error(`port ${port} is held by something that is not this app: stop it, or set E2E_BASE_URL`)
    }
    const adopted: AppUnderTest = {
      baseURL: BASE_URL,
      databaseFile: `${hubDirFor(port)}/db/sqlite.db`,
      mailDir: `${hubDirFor(port)}/mail`,
      // Read-only: whoever booted this server owns writing it, via this same convention.
      logTail: readServerLog(hubDirFor(port)).tail,
      stop: async () => {
        removeClaimedProfiles()
        await Promise.resolve()
      },
    }
    shared = { app: adopted, server: null, controller }
    await resetDatabase(adopted.databaseFile)
    return adopted
  }

  await Bun.$`rm -rf ${hubDir}`.quiet().nothrow()

  // Redirected to a file, not piped: an unread pipe fills at 64KB and blocks the writer
  // (docs/known-issues.md).
  const log = await createServerLog(hubDir)

  // Nuxt directly, not through `bun run dev`: that spawns a child, and killing the parent
  // orphans it still holding the port.
  const server: Subprocess = Bun.spawn(['./node_modules/.bin/nuxt', 'dev', '--port', port], {
    env: { ...process.env, NUXT_PORT: port, NUXT_HUB_DIR: hubDir, E2E_BASE_URL: BASE_URL },
    stdout: log.stdout,
    stderr: log.stderr,
  })
  const began = Date.now()
  try {
    await waitForServer(BASE_URL, controller.signal)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\n${await log.tail()}`, { cause: error })
  }
  // The one boot a run pays for, said out loud: fifteen seconds of silence at the start otherwise
  // looks like a hung suite.
  Bun.write(Bun.stderr, `[e2e] dev server on ${port} ready in ${((Date.now() - began) / 1000).toFixed(1)}s, log in ${hubDir}\n`)

  const app: AppUnderTest = {
    baseURL: BASE_URL,
    databaseFile: `${hubDir}/db/sqlite.db`,
    mailDir: `${hubDir}/mail`,
    logTail: log.tail,
    // The server outlives the suite; what a suite owns is its data and its browser profiles.
    stop: async () => {
      removeClaimedProfiles()
      await Promise.resolve()
    },
  }

  shared = { app, server, controller }
  return app
}

// The shard's server dies with the shard. Without this it outlives the run holding the port, and
// the next run talks to a database it did not create.
function shutdown(): void {
  if (!shared) return
  shared.controller.abort()
  // SIGKILL, not SIGTERM: an exit handler cannot wait for a graceful stop, and a dev server that
  // takes its time going down holds the port the next run refuses to start on.
  shared.server?.kill('SIGKILL')
  shared = null
}

process.on('exit', shutdown)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shutdown()
    process.exit(1)
  })
}

// Every Chrome-backed view leaves a browser profile of roughly 130MB behind, and closing it does
// not remove one, so a suite of a dozen views fills a tmpfs.
function profileDirectories(): Set<string> {
  const found = new Set<string>()
  for (const entry of new Bun.Glob('.*bun-chrome').scanSync({ cwd: '/tmp', onlyFiles: false, dot: true })) {
    found.add(entry)
  }
  return found
}

const claimedProfiles = new Set<string>()

// A run killed part way never reaches its sweep, so profiles pile up until a full tmpfs makes the
// browser suites slow and then flaky. An hour old cannot belong to a live run; minutes is a run.
const STALE_PROFILE_MS = 60 * 60 * 1000

function removeStaleProfiles(): void {
  const cutoff = Date.now() - STALE_PROFILE_MS
  for (const entry of profileDirectories()) {
    const path = `/tmp/${entry}`
    try {
      if (statSync(path).mtimeMs < cutoff) Bun.spawnSync(['rm', '-rf', path])
    }
    catch {
      // Gone between listing and stat, which is the outcome wanted anyway.
    }
  }
}

function claimProfilesSince(before: Set<string>): void {
  for (const entry of profileDirectories()) {
    if (!before.has(entry)) claimedProfiles.add(entry)
  }
}

// Swept when the app stops rather than when each view closes, so nothing is removed while the
// browser that owns it is still shutting down.
function removeClaimedProfiles(): void {
  for (const entry of claimedProfiles) Bun.spawnSync(['rm', '-rf', `/tmp/${entry}`])
  claimedProfiles.clear()
}

// A size is the viewport, which is how a suite stands in a 360 pixel phone (K-102).
export async function openView(size?: { width: number, height: number }): Promise<Bun.WebView> {
  const before = profileDirectories()
  const view = new Bun.WebView({ backend: BACKEND, ...size })
  // Claimed on the spot and never waited for: the profile is there by the time the constructor
  // returns, and a sleep here would push a five-second test over its timeout.
  claimProfilesSince(before)
  return view
}

const SETTLE_TIMEOUT_MS = 15_000
const INTERACTIVE_TIMEOUT_MS = 120_000

// Mounted is not interactive: until Suspense resolves the screen is server-rendered markup with
// no listeners, and the marker must be inside the page, because chrome is patched before it.
export async function waitForInteractive(view: Bun.WebView, marker = 'main'): Promise<void> {
  await waitFor(
    view,
    `document.querySelector('#__nuxt')?.__vue_app__ && document.querySelector(${JSON.stringify(marker)})?.__vueParentComponent`,
    INTERACTIVE_TIMEOUT_MS,
  )
}

// Navigate and wait until the screen will answer a click. Every browser test starts here. The
// dashboard shell renders no <main>, so an admin screen names an element of its own.
export async function visit(view: Bun.WebView, url: string, marker?: string): Promise<void> {
  await view.navigate(url)
  await waitForInteractive(view, marker)
}

// One browser backs every view, so they share a cookie jar: a test that needs a signed-out visitor
// has to end the session rather than assume a new view carries none.
export async function openSignedOutView(baseURL: string, size?: { width: number, height: number }): Promise<Bun.WebView> {
  const view = await openView(size)
  await view.navigate(`${baseURL}/`)
  await waitFor(view, 'document.body')
  // The browser is shared, so a charge another suite left unanswered would come back on this till.
  await view.evaluate(`Object.keys(localStorage).filter(key => key.startsWith('nnt-till-sumup')).forEach(key => localStorage.removeItem(key))`)
  // Waited for: a sign-out answering after the case has signed in would clear the new session.
  await view.evaluate(`(window.__signedOut = false, fetch('/api/auth/sign-out', { method: 'POST' }).finally(() => { window.__signedOut = true }), true)`)
  await waitFor(view, 'window.__signedOut === true')
  return view
}

// Signed in through the form as a person would be, answering the code an enrolled member is asked.
// A view that fails to sign in is closed here, since the caller never receives it to close.
export async function signInView(app: AppUnderTest, email: string, password: string, size?: { width: number, height: number }): Promise<Bun.WebView> {
  const { finishSignIn } = await import('./accounts')
  const view = await openSignedOutView(app.baseURL, size)
  try {
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', email)
    await fill(view, 'form input[type="password"]', password)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, email)
    return view
  }
  catch (failure) {
    view.close()
    throw failure
  }
}

// Polls a boolean expression until it holds. Every assertion about a rendered screen needs this,
// because navigation and hydration both finish after the call that started them.
export async function waitFor(view: Bun.WebView, expression: string, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // Mid-navigation the document can be half gone, so a throw is a not-yet rather than an answer.
    if (await view.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return
    await Bun.sleep(100)
  }
  // Where the page was and what it said, so a timeout on CI is read rather than rerun.
  const seen = await view.evaluate<string>(`location.pathname + ': ' + (document.body?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 240)`).catch(() => 'unreadable')
  // What any alert, dialogue or failure notice said: the reason is usually there, not at the top.
  const said = await view.evaluate<string>(`[...document.querySelectorAll('[role="alert"], [role="status"], [role="dialog"], [data-test*="failure"], [data-test*="refus"]')].map(el => el.innerText.replace(/\\s+/g, ' ').trim()).filter(Boolean).join(' | ').slice(0, 400)`).catch(() => '')
  // The show-night actions on offer, since a missing one is often only named differently.
  const offered = await view.evaluate<string>(`[...document.querySelectorAll('[data-test="night-action"]')].map(el => el.getAttribute('aria-label') ?? '').filter(Boolean).join(' | ').slice(0, 200)`).catch(() => '')
  throw new Error(`timed out waiting for ${expression} (at ${seen})${said ? ` (notices: ${said})` : ''}${offered ? ` (actions: ${offered})` : ''}`)
}

// A plain value assignment is invisible to v-model: Vue listens for the event, and the native
// setter is what makes the framework's own property descriptor fire one.
export async function fill(view: Bun.WebView, selector: string, value: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(field.constructor.prototype, 'value').set
    setter.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

// A number input commits on blur, and a change event makes it put its old text back a frame
// later, so this types, sends input alone, and blurs in the same task (reka-ui NumberFieldInput).
export async function fillNumber(view: Bun.WebView, selector: string, value: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    const focused = document.hasFocus() && document.activeElement === field
    field.blur()
    // A page without the window's focus fires no blur of its own, so the field is told directly.
    if (!focused) field.dispatchEvent(new FocusEvent('blur'))
  })()`)
}

// PinInput is one input per digit, so a six-digit code is six fills and not one.
export async function fillPin(view: Bun.WebView, selector: string, code: string): Promise<void> {
  await waitFor(view, `document.querySelectorAll(${JSON.stringify(selector)}).length >= ${code.length}`)
  for (const [index, digit] of [...code].entries()) {
    await fill(view, `${selector}:nth-of-type(${index + 1})`, digit)
  }
}

// A date field is contenteditable segments rather than an input, so it is typed into rather than
// assigned to. British order, which is what the field is set to (0032).
export async function fillDate(view: Bun.WebView, selector: string, day: string): Promise<void> {
  const [year, month, date] = day.split('-')
  const segments = JSON.stringify(`${selector} [data-reka-date-field-segment]`)
  const digits = JSON.stringify([date, month, year].join(''))

  const type = `(() => {
    const parts = [...document.querySelectorAll(${segments})]
      .filter(segment => segment.getAttribute('data-reka-date-field-segment') !== 'literal')
    const digits = ${digits}
    let index = 0
    for (const segment of parts) {
      segment.focus()
      const wanted = segment.getAttribute('data-reka-date-field-segment') === 'year' ? 4 : 2
      for (let typed = 0; typed < wanted; typed++) {
        segment.dispatchEvent(new KeyboardEvent('keydown', { key: digits[index++], bubbles: true }))
      }
    }
  })()`
  const readBack = `[...document.querySelectorAll(${segments})].map(segment => segment.innerText).join('')`

  await waitFor(view, `document.querySelectorAll(${segments}).length >= 3`)

  // The segments are server-rendered before Vue attaches to them, so a keydown can land on
  // nothing. Typed, then read back, and only typed again if nothing took (0029).
  for (let attempt = 0; attempt < 8; attempt++) {
    await view.evaluate(type)
    for (let settle = 0; settle < 12; settle++) {
      await Bun.sleep(250)
      if (!String(await view.evaluate(readBack)).includes(year!)) continue

      // Left the way a person leaves it. The model commits on the tick after the last segment, so
      // a submit fired in the same breath sends nothing for the date.
      await view.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`)
      await Bun.sleep(250)
      return
    }
  }
  throw new Error(`${selector} would not take the date ${day}`)
}

// A time field is segments like a date field, so it is typed the same way: hour then minute, on a
// 24-hour clock, with the same read-back because the segments render before Vue attaches.
export async function fillTime(view: Bun.WebView, selector: string, time: string): Promise<void> {
  const [hour, minute] = time.split(':')
  const segments = JSON.stringify(`${selector} [data-reka-time-field-segment]`)
  const digits = JSON.stringify(`${hour}${minute}`)

  const type = `(() => {
    const parts = [...document.querySelectorAll(${segments})]
      .filter(segment => segment.getAttribute('data-reka-time-field-segment') !== 'literal')
    const digits = ${digits}
    let index = 0
    for (const segment of parts.slice(0, 2)) {
      segment.focus()
      for (let typed = 0; typed < 2; typed++) {
        segment.dispatchEvent(new KeyboardEvent('keydown', { key: digits[index++], bubbles: true }))
      }
    }
  })()`
  const readBack = `[...document.querySelectorAll(${segments})].map(segment => segment.innerText).join('')`

  await waitFor(view, `document.querySelectorAll(${segments}).length >= 2`)

  for (let attempt = 0; attempt < 8; attempt++) {
    await view.evaluate(type)
    for (let settle = 0; settle < 12; settle++) {
      await Bun.sleep(250)
      if (!String(await view.evaluate(readBack)).includes(minute!)) continue
      await view.evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`)
      await Bun.sleep(250)
      return
    }
  }
  throw new Error(`${selector} would not take the time ${time}`)
}

// A time field has no single value to read: it is segments, joined the same way fillTime confirms
// its own typing landed.
export async function readTime(view: Bun.WebView, selector: string): Promise<string> {
  const segments = JSON.stringify(`${selector} [data-reka-time-field-segment]`)
  return view.evaluate<string>(`[...document.querySelectorAll(${segments})].map(segment => segment.innerText).join('')`)
}

// A date field is segments too; an untyped one reads as its placeholders, with no digit in it.
export async function readDate(view: Bun.WebView, selector: string): Promise<string> {
  const segments = JSON.stringify(`${selector} [data-reka-date-field-segment]`)
  return view.evaluate<string>(`[...document.querySelectorAll(${segments})].map(segment => segment.innerText).join('')`)
}

// A Nuxt UI select is a listbox in a portal, so a value cannot be set on it the way an input takes
// one: the trigger is opened and the option itself is clicked, the way a person does it.
async function openMenu(view: Bun.WebView, selector: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  const trigger = `(() => {
    const root = document.querySelector(${JSON.stringify(selector)})
    return root.matches('button,[role="combobox"]') ? root : root.querySelector('button,[role="combobox"]')
  })()`
  const anyOption = `document.querySelector('[role="option"]')`
  // A click toggles, so an open menu is left open. Inside a modal a click can leave it shut, so a
  // pointer, then the keyboard, follow.
  const ways = [
    `(() => { const t = ${trigger}; if (t.getAttribute('aria-expanded') !== 'true') t.click() })()`,
    `(() => { const t = ${trigger}; for (const type of ['pointerdown', 'pointerup']) t.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', isPrimary: true })); if (t.getAttribute('aria-expanded') !== 'true') t.click() })()`,
    `(() => { const t = ${trigger}; t.focus(); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })()`,
  ]
  for (const way of ways) {
    await view.evaluate(way)
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      if (await view.evaluate<boolean>(`Boolean(${anyOption})`)) return
      await Bun.sleep(100)
    }
  }
  await waitFor(view, anyOption, 6_000)
}

// Reka commits on pointerup rather than on click, and only for a pointer it recognises: a plain
// MouseEvent has no pointerType, and an item inside a popover ignores it, so real pointer events.
const CHOOSE = (label: string): string => `(() => {
  const wanted = ${JSON.stringify(label)}
  const option = [...document.querySelectorAll('[role="option"]')]
    .find(item => item.innerText.trim() === wanted)
    ?? [...document.querySelectorAll('[role="option"]')]
      .find(item => item.innerText.trim().startsWith(wanted))
  if (!option) return false
  // At the option's own centre: a select ignores a release within a few pixels of where the press
  // that opened it landed, and an event with no position lands at the corner.
  const box = option.getBoundingClientRect()
  const init = { bubbles: true, cancelable: true, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }
  for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click']) {
    option.dispatchEvent(type.startsWith('pointer')
      ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, init))
  }
  return true
})()`

// Whether the pointer sequence above actually committed: the listbox unmounts on a real pick,
// so one still open means the option ignored it, as one nested inside a popover does.
const STILL_OPEN = `Boolean(document.querySelector('[role="option"]'))`

// The item a select nested inside a popover ignores from a pointer: it never reaches whatever
// pointer-captured state Reka's own click handling wants, so it is walked to and taken by key.
function highlighted(label: string): string {
  return `(() => {
    const wanted = ${JSON.stringify(label)}
    const options = [...document.querySelectorAll('[role="option"]')]
    const target = options.find(item => item.innerText.trim() === wanted)
      ?? options.find(item => item.innerText.trim().startsWith(wanted))
    return target ? target.hasAttribute('data-highlighted') : null
  })()`
}

async function commitByKeyboard(view: Bun.WebView, label: string): Promise<boolean> {
  for (let step = 0; step < 20; step++) {
    const ready = await view.evaluate<boolean | null>(highlighted(label))
    if (ready === null) return false
    if (ready) break
    await view.evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))`)
    await Bun.sleep(80)
  }
  await view.evaluate(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`)
  await Bun.sleep(200)
  return true
}

async function narrow(view: Bun.WebView, term: string): Promise<void> {
  const typed = await view.evaluate<boolean>(`(() => {
    const panel = document.querySelector('[data-reka-popper-content-wrapper]')
      ?? document.querySelector('[role="listbox"]')?.parentElement
    const search = panel?.querySelector('input')
    if (!search) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(search, ${JSON.stringify(term)})
    search.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  if (typed) await Bun.sleep(400)
}

/** What a select is offering, so a test can assert something is not on the list. */
export async function menuOptions(view: Bun.WebView, selector: string): Promise<string[]> {
  await openMenu(view, selector)
  const found = await view.evaluate<string>(
    `JSON.stringify([...document.querySelectorAll('[role="option"]')].map(item => item.innerText.trim()))`,
  )
  await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  return JSON.parse(found) as string[]
}

/** Choose one option from a select by the text it shows. */
export async function pickOption(view: Bun.WebView, selector: string, label: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    await openMenu(view, selector)
    await narrow(view, label)
    if (await view.evaluate<boolean>(CHOOSE(label))) {
      await Bun.sleep(300)
      if (!(await view.evaluate<boolean>(STILL_OPEN))) return
      if (await commitByKeyboard(view, label)) return
    }
    await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    await Bun.sleep(200)
  }
  throw new Error(`${selector} would not take the option ${label}`)
}

/** Choose several from a multiple select, then close it. */
export async function pickOptions(view: Bun.WebView, selector: string, labels: string[]): Promise<void> {
  await openMenu(view, selector)
  for (const label of labels) {
    await narrow(view, label)
    if (!await view.evaluate<boolean>(CHOOSE(label))) {
      throw new Error(`${selector} would not take the option ${label}`)
    }
    await Bun.sleep(250)
  }
  await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await Bun.sleep(300)
}

// A search box typed as a person does: focused, then sent input alone, since a change event
// makes a combobox put back what it last showed.
export async function typeSearch(view: Bun.WebView, selector: string, term: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    field.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, ${JSON.stringify(term)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}

// The picker searches the server, so this types, waits for the person to appear, and clicks them.
export async function pickPerson(view: Bun.WebView, selector: string, term: string, name: string): Promise<void> {
  const found = `[...document.querySelectorAll('[role="option"]')].some(option => option.innerText.includes(${JSON.stringify(name)}))`
  // Focused and sent input alone: a change event, or a re-render taking focus away, empties the
  // search box, so the term is typed again until the person shows.
  for (let attempt = 1; ; attempt++) {
    await typeSearch(view, `${selector} input`, term)
    try {
      await waitFor(view, found, 8_000)
      break
    }
    catch (missing) {
      if (attempt === 3) throw missing
    }
  }
  await view.evaluate(`[...document.querySelectorAll('[role="option"]')].find(option => option.innerText.includes(${JSON.stringify(name)})).click()`)
}

// A row keeps three actions in line and the rest behind `more-<id>` (K-123 criterion 10), so a
// test presses the overflow and then the action by the words on it.
export async function chooseAction(view: Bun.WebView, trigger: string, label: string): Promise<void> {
  await click(view, trigger)
  const item = `[...document.querySelectorAll('[role="menuitem"]')].find(one => one.innerText.trim() === ${JSON.stringify(label)})`
  await waitFor(view, item)
  await view.evaluate(`${item}.click()`)
  await Bun.sleep(300)
}

/** What a row's overflow offers, by the words on it. */
export async function actionLabels(view: Bun.WebView, trigger: string): Promise<string[]> {
  await click(view, trigger)
  await waitFor(view, `document.querySelector('[role="menuitem"]')`)
  const found = await view.evaluate<string>(
    `JSON.stringify([...document.querySelectorAll('[role="menuitem"]')].map(one => one.innerText.trim()))`,
  )
  await view.evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await Bun.sleep(200)
  return JSON.parse(found) as string[]
}

export async function click(view: Bun.WebView, selector: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

export async function textOf(view: Bun.WebView, selector = 'body'): Promise<string> {
  return view.evaluate<string>(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '')`)
}

// Sign-out sits inside the account menu, which is the one component every shell renders (0040).
export async function signOut(view: Bun.WebView): Promise<void> {
  await click(view, '[data-test=account-menu]')
  await click(view, '.sign-out')
}

// Every label the console sidebar is currently showing, which is what a permission filter changes.
export async function navLabels(view: Bun.WebView): Promise<string[]> {
  return view.evaluate<string[]>(`[...document.querySelectorAll('nav a, nav button')].map(node => node.innerText.trim()).filter(Boolean)`)
}

// Nuxt UI's switch, checkbox and radio keep their drawn size on a show-night screen; the target is
// the row, counted only where a tap on it lands on the control or its label (design-language rule 4).
const DRAWN_TARGET = `control => {
  const row = control.parentElement?.matches('[data-slot="container"]') ? control.parentElement.parentElement ?? control : control
  row.scrollIntoView({ block: 'center' })
  const box = row.getBoundingClientRect()
  const labels = [...(control.labels ?? [])]
  const owns = hit => control.contains(hit) || labels.some(label => label.contains(hit))
  const pinned = hit => {
    for (let node = hit; node && node !== document.body; node = node.parentElement) {
      const place = getComputedStyle(node).position
      if ((place === 'fixed' || place === 'sticky') && !node.contains(row)) return true
    }
    return false
  }
  const inset = Math.min(6, box.width / 4, box.height / 4)
  const points = [[box.left + inset, box.top + inset], [box.right - inset, box.top + inset], [box.left + inset, box.bottom - inset], [box.right - inset, box.bottom - inset]]
  const hits = points.map(([x, y]) => document.elementFromPoint(x, y)).filter(hit => hit && !pinned(hit))
  return { width: box.width, height: box.height, reaches: hits.length > 0 && hits.every(owns) }
}`

export interface NightTarget { what: string, width: number, height: number, reaches: boolean }

// Every control on a show-night page with a box, a drawn choice by its row. Zero-sized elements are
// the ones a `v-if` has taken out, which are not controls anybody can miss.
export const NIGHT_TARGETS = `(() => {
  const drawnTarget = ${DRAWN_TARGET}
  const seen = []
  for (const node of document.querySelectorAll('button, input, select, textarea, [role="combobox"], a[href]')) {
    const rect = node.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    if (getComputedStyle(node).display === 'inline') continue
    const what = node.getAttribute('data-test') ?? node.tagName.toLowerCase()
    if (node.matches(${JSON.stringify(NIGHT_DRAWN_CHOICE)})) seen.push({ what, ...drawnTarget(node) })
    else seen.push({ what, width: rect.width, height: rect.height, reaches: true })
  }
  return JSON.stringify(seen)
})()`

// What falls short of the floor, as a line a failing assertion can print.
export function shortOfFloor(targets: NightTarget[], floor: number): string[] {
  return targets
    .filter(one => one.height < floor || one.width < floor || !one.reaches)
    .map(one => `${one.what} ${Math.round(one.width)}x${Math.round(one.height)}${one.reaches ? '' : ', a tap on its row misses it'}`)
}
