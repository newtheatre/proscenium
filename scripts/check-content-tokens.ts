#!/usr/bin/env bun
// Every {{TOKEN}} in a content page must name a configuration key a visitor may read, so a policy
// page always quotes the value the write path enforces (0012). Anything else fails CI.

import { join } from 'node:path'
import { CONFIG_KEY_NAMES, isConfigKey, isSensitive } from '#shared/utils/config'
import { policyTokenPattern, policyTokenProblem, repeatedUnitProblem } from '#shared/utils/policy-tokens'

const DIR = 'content'

// Paths relative to `content`, so a message names the page the author edits.
function markdownFiles(): string[] {
  try {
    return [...new Bun.Glob('**/*.md').scanSync({ cwd: DIR, onlyFiles: true })].sort()
  }
  catch {
    return []
  }
}

const problems: string[] = []
const repeats: string[] = []
let tokensSeen = 0

const pages = markdownFiles()

for (const file of pages) {
  const lines = (await Bun.file(join(DIR, file)).text()).split('\n')
  lines.forEach((line, index) => {
    for (const match of line.matchAll(policyTokenPattern())) {
      tokensSeen++
      const key = match[1]!
      const known = isConfigKey(key)
      const problem = policyTokenProblem(key, { known, sensitive: known && isSensitive(key) })
      if (problem) problems.push(`${join(DIR, file)}:${index + 1}  ${problem}`)

      // A token that ends a line is followed by the next line's first word once rendered.
      const rest = line.slice(match.index + match[0].length)
      const repeat = repeatedUnitProblem(key, rest.trim() ? rest : lines[index + 1] ?? '')
      if (repeat) repeats.push(`${join(DIR, file)}:${index + 1}  ${repeat}`)
    }
  })
}

if (problems.length) {
  console.error('check-content-tokens: a policy page names a key it may not quote.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nA token that resolves to nothing renders as a visible error at runtime and')
  console.error('publishes a rule the write path does not enforce, which is the drift decision')
  console.error('0012 exists to prevent. Either correct the token or add the key to')
  console.error(`shared/utils/config.ts. Known keys: ${CONFIG_KEY_NAMES.join(', ')}`)
}

if (repeats.length) {
  console.error(`${problems.length ? '\n' : ''}check-content-tokens: a unit is said twice after a token.\n`)
  for (const repeat of repeats) console.error(`  ${repeat}`)
  console.error('\nThe value is rendered with its unit already ("15 minutes", "£20.00", "10%"), so')
  console.error('drop the word after the token.')
}

if (problems.length || repeats.length) process.exit(1)

console.log(`check-content-tokens: ${tokensSeen} token(s) across ${pages.length} page(s), all known, no unit said twice.`)
