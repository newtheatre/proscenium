#!/usr/bin/env bun
// Re-checks an identity core already built by transform-identity.ts against out/manifest.json (K-112, K-115).
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { OUT } from './lib'
import { CORE_PATH, checkIdentity } from './steps'

const manifest = await Bun.file(join(OUT, 'manifest.json')).json()
const summary = await Bun.file(join(OUT, 'transform-summary.json')).json()
const core = new Database(CORE_PATH, { readonly: true })
const failures = checkIdentity(manifest, summary, core)
core.close()
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  process.exit(1)
}
console.log(`Reconciliation green for dumps of ${manifest.stamp}.`)
