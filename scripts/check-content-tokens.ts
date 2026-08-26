#!/usr/bin/env bun
// Every {{TOKEN}} in a content page must name a configuration key, so a policy page always
// quotes the value the write path enforces (0012). An unknown token fails CI.

import { join } from 'node:path'
import { CONFIG_KEY_NAMES, isConfigKey } from '../shared/config'

const DIR = 'content'
const TOKEN = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g

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
    for (const match of line.matchAll(TOKEN)) {
      tokensSeen++
      if (isConfigKey(match[1])) continue
      problems.push(`${join(DIR, file)}:${index + 1}  unknown configuration key \`${match[1]}\``)
    }
  })
}

if (problems.length) {
  console.error('check-content-tokens: a policy page names a key the configuration schema does not have.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nA token that resolves to nothing renders as a visible error at runtime and')
  console.error('publishes a rule the write path does not enforce, which is the drift decision')
  console.error('0012 exists to prevent. Either correct the token or add the key to')
  console.error(`shared/config.ts. Known keys: ${CONFIG_KEY_NAMES.join(', ')}`)
  process.exit(1)
}

console.log(`check-content-tokens: ${tokensSeen} token(s) across ${pages.length} page(s), all known.`)
