// A production's poster and photos (C-23, C-24). The files themselves are the file service's; this
// reads them for the production's page and keeps the photos in the order the theatre chose.
import { all, nowMs, refuse, type UnitView } from '#kit'
import { attachFile, detachFile, fileUrl, restoreFile, type FileRow } from '../files/service'

export const POSTER = 'core.production-poster'
export const PHOTOS = 'core.production-photos'
export const MEDIA_SLOTS = [POSTER, PHOTOS]
const OWNER = 'core.production'

export interface MediaFile {
  id: string
  slot: string
  url: string | null
  state: FileRow['state']
  altText: string | null
  title: string | null
  width: number | null
  height: number | null
  /** Why an upload was refused, as a code. */
  rejectedReason: string | null
  /** For a removed file: when its restore period ends. */
  restorableUntil?: number
}

type Row = FileRow & { sort: number, purge_after: number | null, created_at: number }

const view = (row: Row): MediaFile => ({
  id: row.id,
  slot: row.slot,
  url: row.state === 'ready' ? fileUrl(row.id) : null,
  state: row.state,
  altText: row.alt_text,
  title: row.title,
  width: row.width,
  height: row.height,
  rejectedReason: row.rejected_reason,
  ...(row.state === 'deleted' && row.purge_after !== null ? { restorableUntil: row.purge_after } : {}),
})

/**
 * Everything the production's page shows: the poster, the photos in order, uploads not yet in use
 * (still being checked, refused, or waiting for a description), and what was removed and can still
 * be put back.
 */
export async function productionMedia(productionId: string, now: number) {
  const rows = await all<Row>(
    `SELECT * FROM core_files WHERE owner_type = ? AND owner_id = ? AND slot IN (?, ?)
       AND (state != 'deleted' OR (attached_at IS NOT NULL AND purge_after > ?))
     ORDER BY sort, attached_at, created_at`,
    OWNER, productionId, POSTER, PHOTOS, now,
  )
  const inUse = (r: Row) => r.state === 'ready' && r.attached_at !== null
  return {
    poster: rows.filter(r => r.slot === POSTER && inUse(r)).map(view)[0] ?? null,
    photos: rows.filter(r => r.slot === PHOTOS && inUse(r)).map(view),
    waiting: rows.filter(r => r.attached_at === null && r.state !== 'deleted').map(view),
    removed: rows.filter(r => r.state === 'deleted').sort((a, b) => b.purge_after! - a.purge_after!).map(view),
  }
}

async function ownFile(productionId: string, fileId: string): Promise<{ slot: string }> {
  const [row] = await all<{ slot: string }>('SELECT slot FROM core_files WHERE id = ? AND owner_type = ? AND owner_id = ? AND slot IN (?, ?)', fileId, OWNER, productionId, POSTER, PHOTOS)
  if (!row) refuse('core.files.not-found', 'There is no such file on this production.', { status: 404 })
  return row
}

/** Uses an upload as the poster, setting the old one aside, or adds it after the last photo. */
export async function useMedia(unit: UnitView, productionId: string, fileId: string): Promise<void> {
  const { slot } = await ownFile(productionId, fileId)
  await attachFile(unit, fileId, { slot, ownerType: OWNER, ownerId: productionId })
  if (slot === PHOTOS) {
    unit.add({
      sql: 'UPDATE core_files SET sort = (SELECT coalesce(max(sort), 0) + 1 FROM core_files WHERE owner_type = ? AND owner_id = ? AND slot = ? AND id != ? AND state = \'ready\' AND attached_at IS NOT NULL) WHERE id = ?',
      params: [OWNER, productionId, PHOTOS, fileId, fileId],
    })
  }
}

/** Takes a file off the production, or discards an upload not yet used. It can be put back for a while. */
export async function removeMedia(unit: UnitView, productionId: string, fileId: string): Promise<void> {
  await ownFile(productionId, fileId)
  // A refused upload has no bytes left to keep; dismissing it lets the next sweep take its row.
  unit.add({ sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?, purge_after = ? WHERE id = ? AND state = 'rejected'", params: [nowMs(), nowMs(), fileId] })
  await detachFile(unit, fileId)
}

export async function restoreMedia(unit: UnitView, productionId: string, fileId: string): Promise<void> {
  await restoreFile(unit, fileId, { ownerType: OWNER, ownerId: productionId, slots: MEDIA_SLOTS })
}

/** Puts the photos in the order given, which must name every photo in use exactly once. */
export async function orderPhotos(unit: UnitView, productionId: string, fileIds: string[]): Promise<void> {
  const current = await all<{ id: string }>("SELECT id FROM core_files WHERE owner_type = ? AND owner_id = ? AND slot = ? AND state = 'ready' AND attached_at IS NOT NULL", OWNER, productionId, PHOTOS)
  const same = current.length === fileIds.length && new Set(fileIds).size === fileIds.length && current.every(c => fileIds.includes(c.id))
  if (!same) refuse('core.production.photos-changed', 'The photos changed while you were ordering them.', { status: 409, remedy: 'Reload the page and order them again.' })
  unit.add({
    sql: `UPDATE core_files SET sort = (SELECT key + 1 FROM json_each(?) WHERE value = core_files.id)
           WHERE owner_type = ? AND owner_id = ? AND slot = ? AND id IN (SELECT value FROM json_each(?))`,
    params: [JSON.stringify(fileIds), OWNER, productionId, PHOTOS, JSON.stringify(fileIds)],
  })
  unit.audit({ action: 'update', record: [OWNER, productionId], detail: { photos: 'ordered' } })
}
