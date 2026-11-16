// Fails when the fork differs from the upstream release it has merged anywhere outside the
// theatre's paths, unless the file is listed in site/overrides.json.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const THEATRE = [/^site\//, /^site\.config\.ts$/, /^bun\.lock$/]
const release = git('describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD')
const changed = git('diff', '--name-only', release, 'HEAD').split('\n').filter(Boolean)
const allowed = existsSync('site/overrides.json') ? JSON.parse(readFileSync('site/overrides.json', 'utf8')).files.map(f => f.path) : []
const bad = changed.filter(f => !THEATRE.some(r => r.test(f)) && !allowed.includes(f))
console.log(`Compared with upstream ${release}: ${changed.length} file(s) differ, ${bad.length} outside the theatre's paths.`)
for (const f of bad) console.log(`  ${f}  is upstream's. Put your version under site/ instead, or list it in site/overrides.json.`)
process.exit(bad.length ? 1 : 0)
