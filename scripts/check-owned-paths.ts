// bun run check:paths — for a theatre's copy. Fails when the copy differs from the upstream release
// it last merged anywhere outside the theatre's own paths, unless the file is listed in
// site/overrides.json, so every later release merges cleanly (F-26, F-27).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const THEATRE = [/^site\//, /^wrangler\.jsonc$/, /^bun\.lock$/, /^\.github\/workflows\/theatre-/]

let release: string
try {
  release = git('describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD')
}
catch {
  console.log('No upstream release tag in this history yet, so there is nothing to compare with.')
  process.exit(0)
}
const changed = git('diff', '--name-only', release, 'HEAD').split('\n').filter(Boolean)
const overrides: string[] = existsSync('site/overrides.json') ? JSON.parse(readFileSync('site/overrides.json', 'utf8')).files.map((f: { path: string }) => f.path) : []
const outside = changed.filter(f => !THEATRE.some(r => r.test(f)) && !overrides.includes(f))
console.log(`Compared with upstream ${release}: ${changed.length} file(s) differ, ${outside.length} outside your paths.`)
for (const f of outside) console.log(`  ${f} is upstream's. Put your version under site/ (site/app overrides pages and components), or list it in site/overrides.json with the reason.`)
process.exit(outside.length ? 1 : 0)
