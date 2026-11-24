// bun run metrics: measures what ESLint cannot (import cycles, duplication, type coverage, ignore
// comments) and compares it with metrics.json, failing if any is worse. `--update` records the
// current figures; `worker` measures the built Worker in .output instead.
import { existsSync, readdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { $ } from 'bun'
import madge from 'madge'

type Metric = { value: number, better: 'lower' | 'higher', label: string, unit?: string }
const BASELINE = 'metrics.json'
const mode = process.argv[2] === 'worker' ? 'worker' : 'source'
const update = process.argv.includes('--update')

async function cycles(): Promise<number> {
  // Runtime imports only: a type-only import cannot change the order modules load in.
  const graph = await madge(['layers', 'scripts'], {
    fileExtensions: ['ts'],
    tsConfig: '.nuxt/tsconfig.server.json',
    excludeRegExp: [/\/tests\//, /\.vue$/],
    detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
  })
  const found = graph.circular()
  for (const cycle of found) console.log(`  cycle: ${cycle.join(' -> ')}`)
  return found.length
}

async function duplication(): Promise<number> {
  const out = join(process.env.TMPDIR ?? '/tmp', 'proscenium-jscpd')
  rmSync(out, { recursive: true, force: true })
  await $`bunx jscpd layers scripts --format typescript,vue --min-tokens 70 --ignore ${'**/tests/**,**/migrations/**,**/*.json'} --reporters json --output ${out} --silent`.quiet().nothrow()
  const report = JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8'))
  return report.statistics.total.duplicatedLines
}

async function typeCoverage(project: string): Promise<number> {
  const text = await $`bunx type-coverage -p ${project} --strict`.quiet().nothrow().text()
  const match = text.match(/\((\d+) \/ (\d+)\) ([\d.]+)%/)
  if (!match) throw new Error(`type-coverage gave no figure for ${project}:\n${text}`)
  return Math.floor(Number(match[3]) * 100) / 100
}

async function ignoreComments(): Promise<number> {
  const text = await $`git grep -nE ${'@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable'} -- ${'layers'} ${'scripts'} ${'site'} ${':!**/tests/**'} ${':!scripts/metrics.ts'}`.quiet().nothrow().text()
  return text.split('\n').filter(Boolean).length
}

function gzipSize(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += gzipSize(path)
    else if (/\.(m?js|wasm)$/.test(entry.name)) total += gzipSync(readFileSync(path)).length
  }
  return total
}

async function measure(): Promise<Record<string, Metric>> {
  if (mode === 'worker') {
    if (!existsSync('.output/server')) throw new Error('No .output/server; run bun run build first')
    const nitro = '.output/server/chunks/nitro/nitro.mjs'
    return {
      workerGzipKB: { value: Math.round(gzipSize('.output/server') / 1024), better: 'lower', label: 'Worker code, gzipped', unit: 'KB' },
      nitroGzipKB: { value: Math.round(gzipSync(readFileSync(nitro)).length / 1024), better: 'lower', label: 'nitro.mjs, gzipped', unit: 'KB' },
      browserGzipKB: { value: Math.round(gzipSize('.output/public/_nuxt') / 1024), better: 'lower', label: 'Browser JavaScript, gzipped', unit: 'KB' },
    }
  }
  return {
    importCycles: { value: await cycles(), better: 'lower', label: 'Import cycles' },
    duplicatedLines: { value: await duplication(), better: 'lower', label: 'Duplicated lines' },
    typeCoverageServer: { value: await typeCoverage('.nuxt/tsconfig.server.json'), better: 'higher', label: 'Type coverage, server (strict)', unit: '%' },
    typeCoverageApp: { value: await typeCoverage('.nuxt/tsconfig.app.json'), better: 'higher', label: 'Type coverage, app .ts (strict)', unit: '%' },
    ignoreComments: { value: await ignoreComments(), better: 'lower', label: 'ts-ignore and eslint-disable comments' },
  }
}

// Size grows with features, so the Worker may grow by this share in one change before it fails.
const WORKER_ALLOWANCE = 0.05 // not-policy: a review prompt, not a rule of the theatre's

const baseline: Record<string, number> = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const now = await measure()
const rows: string[] = ['| Metric | Baseline | Now | |', '| --- | --- | --- | --- |']
const worse: string[] = []
let improved = false
for (const [key, m] of Object.entries(now)) {
  const was = baseline[key]
  const allowance = mode === 'worker' && was !== undefined ? was * WORKER_ALLOWANCE : 0
  const isWorse = was !== undefined && (m.better === 'lower' ? m.value > was + allowance : m.value < was)
  const isBetter = was !== undefined && (m.better === 'lower' ? m.value < was : m.value > was)
  improved ||= isBetter
  if (isWorse) worse.push(`${m.label}: ${was}${m.unit ?? ''} -> ${m.value}${m.unit ?? ''}`)
  rows.push(`| ${m.label} | ${was ?? 'none'}${m.unit ?? ''} | ${m.value}${m.unit ?? ''} | ${isWorse ? 'worse' : isBetter ? 'better' : ''} |`)
}
console.log(rows.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Quality metrics (${mode})\n\n${rows.join('\n')}\n\n`)

if (update) {
  const next = { ...baseline }
  for (const [key, m] of Object.entries(now)) next[key] = m.value
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`\nWrote ${BASELINE}.`)
}
else if (worse.length) {
  console.log(`\nWorse than ${BASELINE}:\n  ${worse.join('\n  ')}\nFix it, or if the change is deliberate (a Worker that grew with a feature), run \`bun run metrics${mode === 'worker' ? ' worker' : ''} --update\` and say why in the PR.`)
  process.exit(1)
}
else if (improved) console.log(`\nBetter than ${BASELINE}: run \`bun run metrics${mode === 'worker' ? ' worker' : ''} --update\` and commit it to lock the gain in.`)
