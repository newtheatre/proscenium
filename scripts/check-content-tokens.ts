#!/usr/bin/env bun
// Every {{TOKEN}} in a content page must name a configuration key a visitor may read, so a policy
// page always quotes the value the write path enforces (0012). Anything else fails CI.

import { join } from 'node:path'
import { CONFIG_KEY_NAMES, isConfigKey, isSensitive } from '#shared/utils/config'
import { policyTokenPattern, policyTokenProblem } from '#shared/utils/policy-tokens'

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
  process.exit(1)
}

console.log(`check-content-tokens: ${tokensSeen} token(s) across ${pages.length} page(s), all known.`)
