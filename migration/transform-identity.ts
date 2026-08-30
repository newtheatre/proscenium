#!/usr/bin/env bun
// The rehearsal's transform step: load the dumps, run the identity transform, write the artefacts.
// The transform itself is in identity.ts, so the pipeline is testable without a production export.
import { join } from 'node:path'
import { OUT, ROOT, ensureOut, latestStamp, loadDump } from './lib'
import { createCore, transformIdentity } from './identity'

const stamp = await latestStamp()
ensureOut()

const targetPath = join(OUT, 'unified.sqlite')
if (await Bun.file(targetPath).exists()) await Bun.file(targetPath).delete()
const target = await createCore(targetPath)

// Read back before anything is minted: the same person keeps the same id week to week, which is
// what makes the load an update rather than a second estate (K-112 criterion 4).
const mapPath = join(OUT, 'id-map.tsv')
const idMap = new Map<string, string>()
if (await Bun.file(mapPath).exists()) {
  for (const line of (await Bun.file(mapPath).text()).split('\n')) {
    const [old, fresh] = line.split('\t')
    if (old && fresh) idMap.set(old, fresh)
  }
}
const reused = idMap.size

const auth = await loadDump('auth', stamp)
const mirrors = []
for (const source of ['rooms', 'training', 'proscenium'] as const) {
  mirrors.push({ source, db: await loadDump(source, stamp) })
}

const roleMap: Record<string, string> = await Bun.file(join(ROOT, 'migration/role-map.json')).json()
const { summary, exceptions, unmappedRoles } = transformIdentity({ auth, mirrors, roleMap, idMap, target })

await Bun.write(mapPath, `${[...idMap.entries()].map(([old, fresh]) => `${old}\t${fresh}`).join('\n')}\n`)
await Bun.write(join(OUT, 'exceptions.txt'), exceptions.join('\n') + (exceptions.length ? '\n' : ''))
await Bun.write(join(OUT, 'transform-summary.json'), `${JSON.stringify({ stamp, reusedIds: reused, ...summary, unmappedRoles, exceptions: exceptions.length }, null, 2)}\n`)

console.log(
  `Identity transform complete: ${summary.users} users (${summary.tombstones} tombstones, `
  + `${summary.workspaceWiped} Workspace passwords wiped, ${summary.emailsLowercased} addresses lowercased), `
  + `${summary.grantsImported} grants, ${reused} ids reused, ${exceptions.length} exceptions.`,
)

for (const { db } of mirrors) db.close()
auth.close()
target.close()
