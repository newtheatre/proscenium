// A migration that fails must not take the site down: nothing of it is applied, the failure is
// recorded for the health check, and the runner waits before trying again.
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { migrations, release } from '#test-registry'
import { applyMigrations, checksum, ensureMigrated, installMigrations, migrationFailure } from '#kit/migrations'
import { runInContext, SYSTEM, type KitEnv } from '#kit/context'

const inContext = <T>(fn: () => Promise<T>) => runInContext({ env: { ...(env as unknown as KitEnv), PROSCENIUM_AUTO_MIGRATE: '1' } as KitEnv, actor: SYSTEM, cache: {} }, fn)

describe('a failing migration', () => {
  afterEach(() => installMigrations(migrations, release))

  it('applies nothing, is recorded, and does not stop later requests', async () => {
    const sql = 'CREATE TABLE zz_half (id text);--> statement-breakpoint\nINSERT INTO zz_missing VALUES (1);'
    installMigrations([...migrations, { owner: 'site', name: '99999999999999_fails', sql, checksum: await checksum(sql) }], release)
    await expect(inContext(() => applyMigrations(env.DB))).rejects.toThrow(/failed and was not applied/)
    expect(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE name = 'zz_half'").first()).toBeNull()
    await inContext(async () => {
      await expect(ensureMigrated()).resolves.toBeUndefined()
      expect(migrationFailure()?.message).toMatch(/fails/)
    })
  })
})
