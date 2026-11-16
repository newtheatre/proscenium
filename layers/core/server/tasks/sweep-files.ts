// Hourly: an upload that never finished checking within core.files.upload-timeout is refused, and
// a removed file whose restore period has passed loses its bytes and its row. A file the server
// made whose expiry has passed goes at once, bytes and row: it was never the theatre's to restore.
import { all, defineTask, files as store, nowMs, useSetting } from '#kit'

export default defineTask(async (unit) => {
  const at = nowMs()
  const timeout = await useSetting('core.files.upload-timeout') as number
  // Each stale upload takes three statements (the update, its event, its job); stay well inside one unit.
  const batch = Math.floor(await useSetting('core.units.statement-limit') as number / 4) // not-policy: statements per row, with room
  const stale = await all<{ id: string, object_key: string }>("SELECT id, object_key FROM core_files WHERE state = 'pending' AND created_at < ? LIMIT ?", at - timeout * 1000, batch) // not-policy: seconds to milliseconds
  for (const row of stale) {
    unit.add({ sql: "UPDATE core_files SET state = 'rejected', rejected_reason = 'upload-timeout' WHERE id = ? AND state = 'pending'", params: [row.id] })
    unit.announce('core.file.rejected', { fileId: row.id, reason: 'upload-timeout' }, { record: ['core.file', row.id] })
  }
  const purged = await all<{ id: string, object_key: string }>("SELECT id, object_key FROM core_files WHERE state = 'deleted' AND purge_after < ? LIMIT ?", at, batch)
  for (const row of purged) unit.add({ sql: "DELETE FROM core_files WHERE id = ? AND state = 'deleted'", params: [row.id] })
  // An expired file skips core.files.deleted-retention: it was made to last only so long.
  const expired = await all<{ id: string, object_key: string, slot: string, state: string }>("SELECT id, object_key, slot, state FROM core_files WHERE expires_at < ? AND state != 'pending' LIMIT ?", at, batch)
  for (const row of expired) {
    unit.add({ sql: 'DELETE FROM core_files WHERE id = ? AND expires_at < ?', params: [row.id, at] })
    unit.audit({ action: 'delete', record: ['core.file', row.id], detail: { expired: true } })
    if (row.state === 'ready') unit.announce('core.file.deleted', { fileId: row.id, slot: row.slot }, { record: ['core.file', row.id] })
  }
  unit.afterCommit(async () => {
    for (const row of [...stale, ...purged, ...expired]) await store.delete(row.object_key)
  })
})
