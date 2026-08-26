#!/usr/bin/env bun
// Enforces the comment rules in CONTRIBUTING.md §Comments. Run by CI.

import { join } from 'node:path'

const MAX_LINES = 2
const ROOT = process.cwd()
// `dumps` and `out` are the gitignored migration working directories: they hold production
// member data, so nothing in this repository should ever read them (migration/README.md).
const SKIP = new Set(['node_modules', '.nuxt', '.output', '.wrangler', '.git', '.data', '.claude', 'dist', 'migrations', 'dumps', 'out', '.agents'])
const EXTS = ['ts', 'vue', 'mjs', 'js', 'prisma']

const BANNED_TAGS = /@(param|returns?|prop|props|emits?|module|route|authenticated|admin-only|method|example|see|throws)\b/
// Whole files, not only their comments: the rule covers UI copy and docs too.
// The entity spellings count, or the character stays legal in one encoding.
const EM_DASH = /\u2014|&(?:mdash|#8212|#x2014);/i
const EM_DASH_EXTS = ['ts', 'vue', 'mjs', 'js', 'md', 'yml', 'yaml', 'sql', 'sh', 'json']
const HISTORY = /\b(used to|originally|an earlier version|previously|it used to|we used to|this used to|no longer needed|before this)\b/i
// Thousands-separated counts and precise percentages rot; years and ADR
// numbers do not, so they are not flagged.
const FIGURES = /\b\d{1,3}(,\d{3})+\b|\b\d+\.\d+%/

// Paths relative to the repository root, dot-directories included so a skipped one is
// refused by name here rather than by the glob's default.
function files(exts: string[]): string[] {
  const glob = new Bun.Glob(`**/*.{${exts.join(',')}}`)
  return [...glob.scanSync({ cwd: ROOT, dot: true, onlyFiles: true })]
    .filter(path => !path.split('/').some(segment => SKIP.has(segment)))
    .sort()
}

interface Block { line: number, text: string[] }

// Comment blocks in one file. Ignores comments inside strings only loosely.
function blocks(source: string): Block[] {
  const lines = source.split('\n')
  const found: Block[] = []
  let i = 0
  while (i < lines.length) {
    const s = lines[i]!.trim()
    if (s.startsWith('//')) {
      const start = i
      const text: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('//')) {
        text.push(lines[i]!.trim().slice(2).trim())
        i++
      }
      found.push({ line: start + 1, text })
      continue
    }
    if (s.startsWith('/*') || s.startsWith('<!--')) {
      const start = i
      const closer = s.startsWith('/*') ? '*/' : '-->'
      const text: string[] = []
      while (i < lines.length) {
        let t = lines[i]!.trim()
        t = t.replace(/^<!--/, '').replace(/^\/\*+/, '').replace(/^\*(?!\/)/, '').replace(/-->$/, '').replace(/\*\/$/, '').trim()
        if (t) text.push(t)
        if (lines[i]!.includes(closer)) {
          i++
          break
        }
        i++
      }
      found.push({ line: start + 1, text })
      continue
    }
    i++
  }
  return found
}

async function read(path: string): Promise<string | null> {
  try {
    return await Bun.file(join(ROOT, path)).text()
  }
  catch {
    return null
  }
}

const failures: string[] = []

for (const rel of files(EXTS)) {
  const source = await read(rel)
  if (source === null) continue
  for (const { line, text } of blocks(source)) {
    const body = text.filter(Boolean)
    if (!body.length) continue
    const joined = body.join(' ')
    // Directives are instructions to tooling, not prose.
    if (/^(eslint|@ts-|prettier|c8 |v8 |istanbul|#!)/.test(joined)) continue
    if (body.length > MAX_LINES) failures.push(`${rel}:${line}  ${body.length} lines (max ${MAX_LINES})`)
    if (BANNED_TAGS.test(joined)) failures.push(`${rel}:${line}  JSDoc tag: the signature already says it`)
    if (HISTORY.test(joined)) failures.push(`${rel}:${line}  narrates history: that belongs in an ADR`)
    if (FIGURES.test(joined)) failures.push(`${rel}:${line}  bare figure: put it in docs/, dated`)
  }
}

// Em dashes, everywhere. Generated output and the migration dumps are skipped by files(),
// so a generated file cannot fail the build.
for (const rel of files(EM_DASH_EXTS)) {
  if (rel === join('scripts', 'check-comments.ts')) continue
  const source = await read(rel)
  if (source === null || !EM_DASH.test(source)) continue
  source.split('\n').forEach((line, i) => {
    if (EM_DASH.test(line)) {
      failures.push(`${rel}:${i + 1}  em dash: use a comma, colon, semicolon, parentheses or two sentences`)
    }
  })
}

if (failures.length) {
  console.error(`\n${failures.length} prose rule violation(s):\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nSee CONTRIBUTING.md §Comments.\n')
  process.exit(1)
}
console.log('Comments OK.')
