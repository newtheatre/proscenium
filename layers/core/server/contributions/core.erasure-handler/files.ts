// Erasure: the files an account owns, such as its data downloads, go with it at once, bytes and
// all, without the restore period. Files it uploaded elsewhere stay with their owners; their
// uploader and original name are cleared by the data-class registry.
import { all, nowMs } from '#kit'
import type { ErasureHandler } from '../../points/erasure-handler'

export default {
  async erase(unit, subject) {
    if (!subject.accountId) return
    const at = nowMs()
    const owned = await all<{ id: string, slot: string }>("SELECT id, slot FROM core_files WHERE owner_type = 'core.account' AND owner_id = ? AND state IN ('ready', 'pending')", subject.accountId)
    if (!owned.length) return
    // purge_after now: the next files sweep removes the bytes and the rows.
    unit.add({ sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?, purge_after = ? WHERE owner_type = 'core.account' AND owner_id = ? AND state IN ('ready', 'pending')", params: [at, at, subject.accountId] })
    for (const file of owned) unit.announce('core.file.deleted', { fileId: file.id, slot: file.slot }, { record: ['core.file', file.id] })
  },
} satisfies ErasureHandler
