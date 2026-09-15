import { describe, expect, test } from 'bun:test'

// The docs collection's dump is emitted as a static asset in production, served before the worker
// unless wrangler is told otherwise (0076). Nothing in dev exercises that, so the built config is read.

describe('the documentation dump reaches the worker first', () => {
  test('nuxt.config asks wrangler to run the worker before the asset', async () => {
    const config = await Bun.file('nuxt.config.ts').text()
    expect(config).toContain('run_worker_first')
    expect(config).toContain('/dump.docs.sql')
  })

  // Run after a build, this is the check that counts. Skipped when there is nothing built yet,
  // because a unit suite must not depend on a build having happened.
  test('a built wrangler.json carries the rule', async () => {
    const built = Bun.file('.output/server/wrangler.json')
    if (!await built.exists()) return

    const config = JSON.parse(await built.text()) as { assets?: { run_worker_first?: string[] | boolean } }
    const rule = config.assets?.run_worker_first
    expect(Array.isArray(rule) ? rule : []).toContain('/dump.docs.sql')
  })
})
