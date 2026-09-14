#!/usr/bin/env bun
// Copies each show poster from the old R2 bucket into the unified one and records the new key in
// out/poster-key-map.tsv for the programme step. Rerunnable; needs a wrangler login for both buckets.
import { mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { OUT, ensureOut, idFor, latestStamp, loadDump, readMap, writeMap } from './lib'
import { POSTER_PREFIX, isPosterKey } from '../shared/utils/seo'

const OLD_BUCKET = process.env.OLD_POSTER_BUCKET ?? 'proscenium-blob'
const NEW_BUCKET = process.env.NEW_POSTER_BUCKET ?? 'unified-blob'
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? '3d250a94794003bd921b7f0379de7f00'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

async function wrangler(...args: string[]): Promise<void> {
  const run = Bun.spawn(['bunx', 'wrangler', ...args], { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, stdout: 'pipe', stderr: 'pipe' })
  const code = await run.exited
  if (code !== 0) throw new Error(`wrangler ${args.slice(0, 4).join(' ')} exited ${code}: ${await new Response(run.stderr).text()}`)
}

ensureOut()
const stamp = await latestStamp()
const source = await loadDump('proscenium', stamp)
const showIds = await readMap('show-id-map.tsv')
const posterKeys = await readMap('poster-key-map.tsv')
const scratch = join(OUT, 'posters-tmp')
mkdirSync(scratch, { recursive: true })

const shows = source.query<{ id: string, poster_url: string }, []>('SELECT id, poster_url FROM shows WHERE poster_url IS NOT NULL AND poster_url != \'\'').all()
console.log(`${shows.length} show(s) carry a poster; ${posterKeys.size} already copied.`)

let copied = 0
let failed = 0
for (const show of shows) {
  if (posterKeys.has(show.id)) continue
  // The show keeps the id the programme step mints for it, so the key is right on either order.
  const newShowId = idFor(showIds, show.id)
  const file = basename(show.poster_url).replaceAll(/[^\w.-]/g, '_')
  const extension = file.split('.').pop()?.toLowerCase() ?? ''
  const key = `${POSTER_PREFIX}${newShowId}/${file}`
  if (!isPosterKey(key) || !TYPES[extension]) {
    console.error(`  ${show.id}: ${show.poster_url} does not make a poster key, skipped`)
    failed++
    continue
  }
  const local = join(scratch, `${newShowId}.${extension}`)
  try {
    await wrangler('r2', 'object', 'get', `${OLD_BUCKET}/${show.poster_url}`, '--remote', '--file', local)
    await wrangler('r2', 'object', 'put', `${NEW_BUCKET}/${key}`, '--remote', '--file', local, '--content-type', TYPES[extension]!)
    posterKeys.set(show.id, key)
    await writeMap('poster-key-map.tsv', posterKeys)
    await writeMap('show-id-map.tsv', showIds)
    copied++
    if (copied % 25 === 0) console.log(`  ${copied} copied`)
  }
  catch (error) {
    console.error(`  ${show.id}: ${(error as Error).message.split('\n')[0]}`)
    failed++
  }
  rmSync(local, { force: true })
}

source.close()
rmSync(scratch, { recursive: true, force: true })
console.log(`${copied} poster(s) copied this run, ${failed} failed, ${posterKeys.size} in out/poster-key-map.tsv.`)
if (failed) process.exit(1)
