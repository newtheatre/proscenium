#!/usr/bin/env bun
// The end-to-end suites only. They need a dev server, which costs fifteen seconds to boot, so this
// starts it once, owns it, and kills it when the run ends (0029). `bun run test` is the other one.

import { join } from 'node:path'
import { hubDirFor } from '../tests/helpers/hub-dir'
import type { Subprocess } from 'bun'

// One by default, and that is not timidity: concurrent `nuxt dev` servers share this project's
// .nuxt directory and fight over it, which costs more than the boots they overlap.
const SHARDS = Math.max(1, Number(process.env.E2E_SHARDS ?? 1))
const BASE_PORT = Number(process.env.E2E_BASE_PORT ?? 3101)
const HEARTBEAT_MS = 15_000

const only = process.argv.slice(2)

function suites(directory: string): string[] {
  return [...new Bun.Glob('**/*.test.ts').scanSync({ cwd: directory, onlyFiles: true })]
    .map(path => join(directory, path))
    .sort()
}

const elapsed = (since: number): string => `${((Date.now() - since) / 1000).toFixed(0)}s`

interface Shard {
  index: number
  files: string[]
  done: number
  current?: string
  process?: Subprocess
}

// Round robin rather than by size: the suites are within a few seconds of each other once the boot
// they all pay for is counted, so balancing by file length would sort by the wrong thing.
function deal(files: string[]): Shard[] {
  const shards: Shard[] = Array.from({ length: Math.min(SHARDS, files.length) }, (_, index) => ({ index, files: [], done: 0 }))
  files.forEach((file, position) => shards[position % shards.length]!.files.push(file))
  return shards
}

async function stream(shard: Shard, from: ReadableStream<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder()
  const reader = from.getReader()
  let carry = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    carry += decoder.decode(value, { stream: true })
    const lines = carry.split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) {
      // The harness writes this straight to the descriptor, which is the only thing that escapes
      // bun's per-file buffering and so the only live progress a run has.
      if (line.includes('[e2e] ') && /\d+\/\d+/.test(line)) {
        shard.done += 1
        shard.current = line.slice(line.indexOf('[e2e] '))
      }
      console.log(`  ${shard.index + 1}| ${line}`)
    }
  }
  if (carry) console.log(`  ${shard.index + 1}| ${carry}`)
}

// A cold .nuxt compiles a route the first time it is asked for, and the first suite to open one
// pays for that inside its own timeout. Paid here instead, once, outside every test.
const WARM = [
  '/', '/sign-in', '/register', '/verify', '/magic', '/reset',
  '/account/security', '/admin', '/admin/people', '/admin/config', '/admin/audit',
  '/admin/fellows', '/admin/members', '/dev', '/foh',
]

// Keeps the last few lines so a server that never becomes healthy can say why.
async function drain(from: ReadableStream<Uint8Array>, tail: string[]): Promise<void> {
  const decoder = new TextDecoder()
  const reader = from.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    tail.push(decoder.decode(value, { stream: true }))
    if (tail.length > 40) tail.shift()
  }
}

async function warm(port: number): Promise<void> {
  await Promise.all(WARM.map(path =>
    fetch(`http://localhost:${port}${path}`, { signal: AbortSignal.timeout(120_000) }).catch(() => undefined)))
}

// The runner owns the dev server, not the suites: a `finally` here always runs, and an exit hook
// inside a bun test process does not, so a leaked server would hold the port.

// Freeing the socket is not enough: a surviving runner takes the port straight back.
function held(port: number): void {
  if (!portIsFree(port)) {
    throw new Error(`port ${port} is already held. Check whose it is before killing anything: `
      + `ps -eo pid,args | grep "[r]un-tests.ts". Another run on this machine binds the same port `
      + `by default, and clearing it takes that run down. Set E2E_BASE_PORT to avoid sharing.`)
  }
}

function portIsFree(port: number): boolean {
  try {
    const probe = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } })
    probe.stop(true)
    return true
  }
  catch {
    return false
  }
}

async function serve(port: number): Promise<Subprocess> {
  // Said plainly rather than polled for three minutes: nuxt dev falls back to another port when
  // this one is taken, and then nothing ever answers where the suites are looking.
  if (!portIsFree(port)) {
    throw new Error(`port ${port} is already held: stop whatever is on it, then run this again`)
  }

  const hubDir = hubDirFor(port)
  await Bun.$`rm -rf ${hubDir}`.quiet().nothrow()
  const server = Bun.spawn(['./node_modules/.bin/nuxt', 'dev', '--port', String(port)], {
    env: { ...process.env, NUXT_PORT: String(port), NUXT_HUB_DIR: hubDir, E2E_BASE_URL: `http://localhost:${port}` },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Drained, not merely piped: a pipe nobody reads fills at 64KB and blocks the writer, and a dev
  // server frozen mid-log answers every request with a 500.
  const tail: string[] = []
  void drain(server.stdout as ReadableStream<Uint8Array>, tail)
  void drain(server.stderr as ReadableStream<Uint8Array>, tail)

  // Health rather than any response: the dev server answers long before the hub module has
  // applied the migrations, and a suite that starts then talks to an empty schema.
  const deadline = Date.now() + 180_000
  let last = 'no answer'
  while (Date.now() < deadline) {
    try {
      const health = await (await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) })).json() as { ok?: boolean }
      if (health.ok === true) {
        await warm(port)
        return server
      }
      last = JSON.stringify(health)
    }
    catch { /* not up yet */ }
    await Bun.sleep(250)
  }
  server.kill('SIGKILL')
  throw new Error(`the dev server on ${port} never became healthy: ${last}\n${tail.join('')}`)
}

async function e2e(files: string[]): Promise<boolean> {
  if (!files.length) return true
  const began = Date.now()
  const shards = deal(files)
  const plural = shards.length === 1 ? 'one server, booted once and reused' : `${shards.length} shards, one server each`

  // Ports checked before the banner, not after: a refusal that has already announced the run
  // reads as a finished one to anything watching the output for that line.
  for (const shard of shards) held(BASE_PORT + shard.index)
  console.log(`end-to-end: ${files.length} suites, ${plural}\n`)

  const servers = await Promise.all(shards.map(shard => serve(BASE_PORT + shard.index)))
  console.log(`  servers ready after ${elapsed(began)}\n`)

  const running = shards.map(async (shard) => {
    shard.process = Bun.spawn(['bun', 'test', ...shard.files], {
      env: { ...process.env, E2E_BASE_URL: `http://localhost:${BASE_PORT + shard.index}` },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await Promise.all([
      stream(shard, shard.process.stdout as ReadableStream<Uint8Array>),
      stream(shard, shard.process.stderr as ReadableStream<Uint8Array>),
    ])
    return await shard.process.exited
  })

  // Without this a shard is silent for the two minutes it spends on a suite, and a slow run looks
  // identical to a hung one.
  const heartbeat = setInterval(() => {
    const still = shards.map(shard => shard.current ?? 'booting').join(' | ')
    console.log(`  ... ${elapsed(began)}: ${still}`)
  }, HEARTBEAT_MS)

  try {
    const codes = await Promise.all(running)
    console.log(`\nend-to-end: ${codes.every(code => code === 0) ? 'pass' : 'FAIL'} in ${elapsed(began)}`)
    return codes.every(code => code === 0)
  }
  finally {
    clearInterval(heartbeat)
    for (const server of servers) server.kill('SIGKILL')
  }
}

// Named files go straight to bun, unsharded: sharding one suite buys nothing and hides its output.

// E2E_BASE_URL is set here too, or a filtered run silently ignores E2E_BASE_PORT.
if (only.length) {
  const run = Bun.spawn(['bun', 'test', ...only], {
    env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? `http://localhost:${BASE_PORT}` },
    stdout: 'inherit',
    stderr: 'inherit',
  })
  process.exit(await run.exited)
}

const began = Date.now()
const passed = await e2e(suites('tests/e2e'))

console.log(`total ${elapsed(began)}`)
process.exit(passed ? 0 : 1)
