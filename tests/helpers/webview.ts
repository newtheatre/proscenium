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

// Bun.spawn resolves `exited` when the process is reaped, which is not the same instant the
// listener lets go of the socket.
async function waitForPortFree(port: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const probe = Bun.listen({ hostname: '127.0.0.1', port: Number(port), socket: { data() {} } })
      probe.stop(true)
      return
    }
    catch {
      await Bun.sleep(100)
    }
  }
  throw new Error(`port ${port} is still held after the app was stopped`)
}

export interface AppUnderTest {
  baseURL: string
  databaseFile: string
  stop: () => Promise<void>
}

// Its own database per run, inside the gitignored .data: sharing one lets a run depend on what
// the last one left, which is how "the last administrator" stops being true mid-suite.
export async function startApp(): Promise<AppUnderTest> {
  const controller = new AbortController()
  const port = new URL(BASE_URL).port
  // A stable path, wiped on the way in rather than out: a crashed run leaves nothing behind,
  // and the hub module appends its own .gitignore line for every distinct directory it sees.
  const hubDir = '.data/e2e'
  await Bun.$`rm -rf ${hubDir}`.quiet().nothrow()

  // Nuxt directly, not through `bun run dev`: that spawns nuxt as a child, and killing the parent
  // orphans it still holding the port, so the next suite talks to the last suite's database.
  const server: Subprocess = Bun.spawn(['./node_modules/.bin/nuxt', 'dev', '--port', port], {
    env: { ...process.env, NUXT_PORT: port, NUXT_HUB_DIR: hubDir },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer(BASE_URL, controller.signal)
  return {
    baseURL: BASE_URL,
    databaseFile: `${hubDir}/db/sqlite.db`,
    stop: async () => {
      controller.abort()
      server.kill()
      await server.exited
      // Proved rather than assumed: a suite that leaves the port held makes the next one talk to
      // a database it did not create.
      await waitForPortFree(port)
      removeClaimedProfiles()
    },
  }
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

export async function openView(): Promise<Bun.WebView> {
  const before = profileDirectories()
  const view = new Bun.WebView({ backend: BACKEND })
  // Claimed on the spot and never waited for: the profile is there by the time the constructor
  // returns, and a sleep here would push a five-second test over its timeout.
  claimProfilesSince(before)
  return view
}

const SETTLE_TIMEOUT_MS = 15_000
const INTERACTIVE_TIMEOUT_MS = 90_000

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

// PinInput is one input per digit, so a six-digit code is six fills and not one.
export async function fillPin(view: Bun.WebView, selector: string, code: string): Promise<void> {
  await waitFor(view, `document.querySelectorAll(${JSON.stringify(selector)}).length >= ${code.length}`)
  for (const [index, digit] of [...code].entries()) {
    await fill(view, `${selector}:nth-of-type(${index + 1})`, digit)
  }
}

export async function click(view: Bun.WebView, selector: string): Promise<void> {
  await waitFor(view, `document.querySelector(${JSON.stringify(selector)})`)
  await view.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

export async function textOf(view: Bun.WebView, selector = 'body'): Promise<string> {
  return view.evaluate<string>(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '')`)
}
