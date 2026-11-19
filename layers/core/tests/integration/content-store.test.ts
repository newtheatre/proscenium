// The minute tick clears a content load cut short once it has stayed unfinished for two minutes, and
// asks for every collection, so the tick, not a visitor, does the loading (docs/kit, "The content store").
import { beforeEach, describe, expect, it } from 'vitest'
import { mendContentStore } from '../../server/content-store'
import { env } from '../../../../tests/integration/helpers'

const MINUTE = 60_000
const cache = env.CACHE!

async function info(rows: { id: string, version: string, ready: boolean }[]) {
  await env.DB.prepare('DROP TABLE IF EXISTS _content_info').run()
  await env.DB.prepare('CREATE TABLE _content_info (id TEXT PRIMARY KEY, ready BOOLEAN, structureVersion VARCHAR, version VARCHAR)').run()
  for (const r of rows) await env.DB.prepare('INSERT INTO _content_info (id, ready, structureVersion, version) VALUES (?, ?, ?, ?)').bind(r.id, r.ready ? 1 : 0, 's', r.version).run()
}
const ids = async () => (await env.DB.prepare('SELECT id FROM _content_info ORDER BY id').all<{ id: string }>()).results.map(r => r.id)

describe('mending the content store', () => {
  let asked: string[]
  const query = async (collection: string, sql: string) => {
    asked.push(collection)
    expect(sql).toBe(`SELECT * FROM _content_${collection} ORDER BY id ASC LIMIT 1`)
  }
  beforeEach(async () => {
    asked = []
    const keys = await cache.list({ prefix: 'core:content-unready:' })
    for (const k of keys.keys) await cache.delete(k.name)
  })

  it('asks for every ready collection, so a new deploy\'s content is loaded by the tick', async () => {
    await info([{ id: 'checksum_pages', version: 'v1', ready: true }, { id: 'checksum_navigation', version: 'v1', ready: true }])
    expect(await mendContentStore(env.DB, cache, 0, query)).toEqual({ cleared: [], loaded: ['pages', 'navigation'] })
    expect(asked).toEqual(['pages', 'navigation'])
  })

  it('leaves a load in progress alone, and clears one still unfinished two minutes later', async () => {
    await info([{ id: 'checksum_pages', version: 'v2', ready: false }, { id: 'checksum_navigation', version: 'v2', ready: true }])
    const at = 10 * MINUTE
    expect((await mendContentStore(env.DB, cache, at, query)).cleared).toEqual([])
    expect((await mendContentStore(env.DB, cache, at + MINUTE, query)).cleared).toEqual([])
    expect(await ids()).toContain('checksum_pages')
    asked = []
    expect(await mendContentStore(env.DB, cache, at + 2 * MINUTE, query)).toEqual({ cleared: ['pages'], loaded: ['pages', 'navigation'] })
    expect(await ids()).toEqual(['checksum_navigation'])
    expect(asked).toEqual(['pages', 'navigation'])
  })

  it('does not hold a later deploy\'s load to an earlier one\'s clock', async () => {
    await info([{ id: 'checksum_pages', version: 'v3', ready: false }])
    await mendContentStore(env.DB, cache, 0, query)
    await info([{ id: 'checksum_pages', version: 'v4', ready: false }])
    expect((await mendContentStore(env.DB, cache, 5 * MINUTE, query)).cleared).toEqual([])
    expect(await ids()).toEqual(['checksum_pages'])
  })

  it('does nothing where Nuxt Content has made no store, and survives a collection that fails to load', async () => {
    await env.DB.prepare('DROP TABLE IF EXISTS _content_info').run()
    expect(await mendContentStore(env.DB, cache, 0, query)).toEqual({ cleared: [], loaded: [] })
    await info([{ id: 'checksum_pages', version: 'v1', ready: true }])
    expect(await mendContentStore(env.DB, cache, 0, async () => { throw new Error('no') })).toEqual({ cleared: [], loaded: [] })
  })
})
