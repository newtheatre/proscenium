// Runs before each integration test file: installs the test registry (core plus the fixture
// modules), applies migrations through the kit's own runner, switches the fixtures on, and replaces
// the queues with a recorder so a test decides when jobs run.
import { env } from 'cloudflare:workers'
import { registry, migrations, release } from '#test-registry'
import { installRegistry } from '#kit/registry'
import { applyMigrations, installMigrations } from '#kit/migrations'
import { setAccessProvider } from '#kit/access'
import { setDispatcher } from '#kit/dispatch'
import { runInContext, SYSTEM, type KitEnv } from '#kit/context'
import { saveKey, sent, testAccess } from './helpers'
import { credentialEntry } from '#kit/secrets'

installRegistry(registry)
installMigrations(migrations, release)
setAccessProvider(testAccess)
setDispatcher(async (messages) => {
  sent.push(...messages)
})
await runInContext({ env: env as unknown as KitEnv, actor: SYSTEM, cache: {} }, () => applyMigrations(env.DB))
await env.DB.batch(['seats', 'notify'].map(id => env.DB.prepare('INSERT INTO core_modules (module_id, enabled) VALUES (?, 1) ON CONFLICT (module_id) DO UPDATE SET enabled = 1').bind(id)))
// Keys a theatre saves in the app: the challenge is on, and lists can be hashed, unless a test removes them.
await runInContext({ env: env as unknown as KitEnv, actor: SYSTEM, cache: {} }, async () => {
  for (const [name, value] of [['CORE_TURNSTILE_SECRET_KEY', 'test-turnstile-secret'], ['MEMBERSHIP_LIST_KEY', 'test-list-key-not-secret']]) {
    if (credentialEntry(name!)) await saveKey(name!, value!)
  }
})
