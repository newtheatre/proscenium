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
import { sent, testAccess } from './helpers'

installRegistry(registry)
installMigrations(migrations, release)
setAccessProvider(testAccess)
setDispatcher(async (messages) => {
  sent.push(...messages)
})
await runInContext({ env: env as unknown as KitEnv, actor: SYSTEM, cache: {} }, () => applyMigrations(env.DB))
await env.DB.batch(['seats', 'notify'].map(id => env.DB.prepare('INSERT INTO core_modules (module_id, enabled) VALUES (?, 1) ON CONFLICT (module_id) DO UPDATE SET enabled = 1').bind(id)))
