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
  try {
    new Bun.WebView({ backend: BACKEND }).close()
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

  const server: Subprocess = Bun.spawn(['bun', 'run', 'dev', '--port', port], {
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
    },
  }
}

export async function openView(): Promise<Bun.WebView> {
  return new Bun.WebView({ backend: BACKEND })
}
