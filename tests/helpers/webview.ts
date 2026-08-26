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
  stop: () => Promise<void>
}

// Reuses a server already listening on the port, so a developer with `bun run dev` open does
// not wait for a second one to boot.
export async function startApp(): Promise<AppUnderTest> {
  const controller = new AbortController()
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1500) })
    if (response.ok) return { baseURL: BASE_URL, stop: async () => {} }
  }
  catch { /* start our own */ }

  const port = new URL(BASE_URL).port
  const server: Subprocess = Bun.spawn(['bun', 'run', 'dev', '--port', port], {
    env: { ...process.env, NUXT_PORT: port },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer(BASE_URL, controller.signal)
  return {
    baseURL: BASE_URL,
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
