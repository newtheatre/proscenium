import { describe, expect, test } from 'bun:test'

// A cron registered against a handler that does not exist errors on every firing, and nothing
// but this notices: the Worker builds and deploys perfectly well without it.

const config = await Bun.file('nuxt.config.ts').text()

function scheduledTasks(): Record<string, string[]> {
  const block = config.match(/scheduledTasks:\s*\{([\s\S]*?)\n {4}\},/)?.[1] ?? ''
  const registered: Record<string, string[]> = {}
  for (const [, cron, names] of block.matchAll(/'([^']+)':\s*\[([^\]]+)\]/g)) {
    registered[cron!] = [...names!.matchAll(/'([^']+)'/g)].map(match => match[1]!)
  }
  return registered
}

function cronTriggers(): string[] {
  const block = config.match(/crons:\s*\[([^\]]+)\]/)?.[1] ?? ''
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]!)
}

const taskFiles = new Set([...new Bun.Glob('**/*.ts').scanSync({ cwd: 'server/tasks' })]
  .map(path => path.replace(/\.ts$/, '').replaceAll('/', ':')))

describe('the scheduled tasks and the crons that fire them', () => {
  test('there is at least one, so a broken parse cannot pass by finding nothing', () => {
    expect(Object.keys(scheduledTasks()).length).toBeGreaterThan(0)
    expect(taskFiles.size).toBeGreaterThan(0)
  })

  test('every registered task has a handler', () => {
    const registered = Object.values(scheduledTasks()).flat()
    expect(registered.filter(name => !taskFiles.has(name))).toEqual([])
  })

  test('every handler is registered, so nothing is written and left unfired', () => {
    const registered = new Set(Object.values(scheduledTasks()).flat())
    expect([...taskFiles].filter(name => !registered.has(name))).toEqual([])
  })

  // The wrangler list is what Cloudflare actually fires; Nitro's map is what answers.
  test('the cron triggers mirror the scheduled tasks one for one', () => {
    expect([...cronTriggers()].sort()).toEqual(Object.keys(scheduledTasks()).sort())
  })
})
