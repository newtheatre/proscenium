import { statSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { hubDirFor } from './hub-dir'
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
  stop: () => Promise<void>
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

// Emptied and never replaced: the server holds the file open (0029). The schema is not touched
// either, so audit_log stays, being append-only by a trigger this must not drop.
const KEPT = new Set(['_hub_migrations', 'audit_log'])

// The dev server is serving from this file while we wipe it, and the journal is `delete` rather
// than WAL, so its readers and our writer lock each other out. Waiting beats throwing at once.
const RESET_LOCK_WAIT_MS = 10_000
const RESET_ATTEMPTS = 5

export function resetDatabase(file: string): void {
  const database = new Database(file)
  try {
    database.run(`PRAGMA busy_timeout = ${RESET_LOCK_WAIT_MS}`)
    const tables = (database.query(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[]).filter(table => !KEPT.has(table.name))

    // An append-only table refuses a delete, and its rows hold a foreign key onto users, so a
    // reset cannot get past either without lifting the guards (0010).
    const triggers = database.query(`
      SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL
    `).all() as { name: string, sql: string }[]

    // One transaction, so the lock is taken and released once, and so the guards are never off
    // outside it. Recreated from the schema rather than restated, so they cannot drift.
    const wipe = database.transaction(() => {
      for (const trigger of triggers) database.run(`DROP TRIGGER IF EXISTS ${trigger.name}`)
      for (const table of tables) database.run(`DELETE FROM ${table.name}`)
      for (const trigger of triggers) database.run(trigger.sql)
    })

    // A rolled-back attempt leaves the guards up, so retrying is safe. One suite losing the race
    // aborts every suite after it, because none of them gets a reset either.
    for (let attempt = 1; ; attempt++) {
      try {
        wipe()
        break
      }
      catch (thrown) {
        const busy = String(thrown).includes('SQLITE_BUSY') || String(thrown).includes('database is locked')
        if (!busy || attempt === RESET_ATTEMPTS) throw thrown
        Bun.sleepSync(200 * attempt)
      }
    }
  }
  finally {
    database.close()
  }
}

// Its own database per suite, inside the gitignored .data: sharing one lets a suite depend on what
// the last one left, which is how "the last administrator" stops being true mid-run.
export async function startApp(): Promise<AppUnderTest> {
  announce(callingSuite(), ++suitesStarted, runBegan)
  removeStaleProfiles()

  if (shared) {
    resetDatabase(shared.app.databaseFile)
    return shared.app
  }

  const controller = new AbortController()
  const port = new URL(BASE_URL).port
  // A stable path, wiped on the way in rather than out: a crashed run leaves nothing behind.
  const hubDir = hubDirFor(port)

  // Adopted rather than replaced: `bun run test` boots the server before the suites and kills it
  // after, so what a suite usually finds here is one that is already up.
  if (!portIsFree(port)) {
    if (!await alreadyServing()) {
      throw new Error(`port ${port} is held by something that is not this app: stop it, or set E2E_BASE_URL`)
    }
    const adopted: AppUnderTest = {
      baseURL: BASE_URL,
      databaseFile: `${hubDirFor(port)}/db/sqlite.db`,
      stop: async () => {
        removeClaimedProfiles()
        await Promise.resolve()
      },
    }
    shared = { app: adopted, server: null, controller }
    resetDatabase(adopted.databaseFile)
    return adopted
  }

  await Bun.$`rm -rf ${hubDir}`.quiet().nothrow()

  // Nuxt directly, not through `bun run dev`: that spawns a child, and killing the parent orphans
  // it still holding the port. Output is discarded, because a pipe nobody reads blocks the writer.
  const server: Subprocess = Bun.spawn(['./node_modules/.bin/nuxt', 'dev', '--port', port], {
    env: { ...process.env, NUXT_PORT: port, NUXT_HUB_DIR: hubDir, E2E_BASE_URL: BASE_URL },
    stdout: 'ignore',
    stderr: 'ignore',
  })
  const began = Date.now()
  await waitForServer(BASE_URL, controller.signal)
  // The one boot a run pays for, said out loud: fifteen seconds of silence at the start otherwise
  // looks like a hung suite.
  Bun.write(Bun.stderr, `[e2e] dev server on ${port} ready in ${((Date.now() - began) / 1000).toFixed(1)}s\n`)

  const app: AppUnderTest = {
    baseURL: BASE_URL,
    databaseFile: `${hubDir}/db/sqlite.db`,
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
export async function openSignedOutView(baseURL: string): Promise<Bun.WebView> {
  const view = await openView()
  await view.navigate(`${baseURL}/`)
  await waitFor(view, 'document.body')
  await view.evaluate(`fetch('/api/auth/sign-out', { method: 'POST' }).then(response => response.status)`)
  return view
}

// Polls a boolean expression until it holds. Every assertion about a rendered screen needs this,
// because navigation and hydration both finish after the call that started them.
export async function waitFor(view: Bun.WebView, expression: string, timeoutMs = SETTLE_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await view.evaluate<boolean>(`Boolean(${expression})`)) return
    await Bun.sleep(100)
  }
  throw new Error(`timed out waiting for ${expression}`)
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

// A number input formats and commits on blur, so a value assigned without one is never read.
// It has to be focused first: blur() on an element that never held focus fires no event at all.
export async function fillNumber(view: Bun.WebView, selector: string, value: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
  await fill(view, selector, value)
  await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).blur()`)
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

// A Nuxt UI select is a listbox in a portal, so a value cannot be set on it the way an input takes
// one: the trigger is opened and the option itself is clicked, the way a person does it.
async function openMenu(view: Bun.WebView, selector: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)})
    const trigger = root.matches('button,[role="combobox"]') ? root : root.querySelector('button,[role="combobox"]')
    trigger.click()
  })()`)
  await waitFor(view, `document.querySelector('[role="option"]')`, 15_000)
}

// Reka commits on pointerup rather than on click, so the whole sequence is sent.
const CHOOSE = (label: string): string => `(() => {
  const wanted = ${JSON.stringify(label)}
  const option = [...document.querySelectorAll('[role="option"]')]
    .find(item => item.innerText.trim() === wanted)
    ?? [...document.querySelectorAll('[role="option"]')]
      .find(item => item.innerText.trim().startsWith(wanted))
  if (!option) return false
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    option.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
  }
  return true
})()`

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
      return
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

// The picker searches the server, so this types, waits for the person to appear, and clicks them.
export async function pickPerson(view: Bun.WebView, selector: string, term: string, name: string): Promise<void> {
  await click(view, `${selector} input`)
  await fill(view, `${selector} input`, term)
  await waitFor(view, `[...document.querySelectorAll('[role="option"]')].some(option => option.innerText.includes(${JSON.stringify(name)}))`, 20_000)
  await view.evaluate(`[...document.querySelectorAll('[role="option"]')].find(option => option.innerText.includes(${JSON.stringify(name)})).click()`)
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
