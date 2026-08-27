#!/usr/bin/env bun
// One notification centre (0013, H-101 criterion 1). If any code but the centre can reach the
// mail binding, every rule the centre enforces becomes optional.

import { join } from 'node:path'

// The one file allowed to touch the binding, and the one place the rules live.
const CENTRE = 'server/utils/notify.ts'

// Only server code can reach a binding, so that is the whole search. Naming the identifier
// beats matching spellings: env.EMAIL and (env as never)['EMAIL'] are the same mistake.
const BINDING = /\bEMAIL\b/
const COMPOSES_A_MESSAGE = /\.\s*send\s*\(\s*\{[^}]*\bfrom\s*:/s

// server/db holds schema declarations. They name EMAIL as a channel value and cannot reach a
// binding, because nothing there runs in a request.
function serverFiles(): string[] {
  return [...new Bun.Glob('**/*.ts').scanSync({ cwd: 'server', onlyFiles: true })]
    .map(path => join('server', path))
    .filter(path => path !== CENTRE && !path.startsWith(join('server', 'db')))
    .sort()
}

const problems: string[] = []

for (const file of serverFiles()) {
  const source = await Bun.file(file).text()

  source.split('\n').forEach((line, index) => {
    if (BINDING.test(line)) problems.push(`${file}:${index + 1}  names the mail binding`)
  })

  if (COMPOSES_A_MESSAGE.test(source)) {
    problems.push(`${file}  composes a message to send`)
  }
}

if (problems.length) {
  console.error('check-notifications: only the notification centre may send.\n')
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(`\nEvery outbound message goes through \`notify()\` in ${CENTRE}, which types it`)
  console.error('against the catalogue, refuses undeliverable and anonymised addresses, honours')
  console.error('preferences for anything not transactional, and logs the outcome either way.')
  console.error('Reaching the binding elsewhere skips all of it (decision 0013, story H-101).')
  process.exit(1)
}

console.log(`check-notifications: ${serverFiles().length} server files checked, only ${CENTRE} sends.`)
