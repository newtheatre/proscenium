// The file service (C-23, C-36): an upload is stored, checked and cleaned in a job, then attached
// to its owner. Nothing is served until it is ready, and the bytes are only reachable through the
// row, at /files/<id>.
import { first, nowMs, refuse, usePoint, useSetting, files as store } from '#kit'
import type { UnitView } from '#kit'
import { clean, MEDIA_TYPES, Rejected, sniff, type FileKind } from './inspect'

export interface FileSlot {
  id: string
  owner: string
  ability: string
  many?: boolean
  accepts: FileKind[]
  limit: string
  access: 'public' | 'signed_in' | 'record'
  textClass: 'public' | 'internal' | 'personal'
  clean: boolean
}

export interface FileRow {
  id: string
  object_key: string
  owner_type: string
  owner_id: string
  slot: string
  state: 'pending' | 'ready' | 'rejected' | 'deleted'
  access: FileSlot['access']
  media_type: string
  byte_size: number
  width: number | null
  height: number | null
  title: string | null
  alt_text: string | null
  uploaded_by: string | null
  attached_at: number | null
  rejected_reason: string | null
}

const MEGABYTE = 1024 * 1024 // not-policy: unit of size

export async function fileSlot(id: string): Promise<FileSlot | undefined> {
  return (await usePoint<FileSlot>('core.file-slot')).find(s => s.value.id === id)?.value
}

/** The largest upload a slot takes, in bytes. */
export async function slotLimit(slot: FileSlot): Promise<number> {
  return (await useSetting(slot.limit as any) as number) * MEGABYTE
}

export async function fileRow(id: string): Promise<FileRow | null> {
  return first<FileRow>('SELECT * FROM core_files WHERE id = ?', id)
}

export function fileUrl(id: string): string {
  return `/files/${id}`
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
}

/**
 * The job's work: judge the type from the bytes, refuse what the slot does not take, clean what
 * the slot cleans, and store the cleaned bytes in place. Returns the outcome for the job to record.
 */
export async function checkStoredFile(row: FileRow, unit: UnitView): Promise<'ready' | 'rejected'> {
  const reject = async (reason: string) => {
    unit.add({ sql: "UPDATE core_files SET state = 'rejected', rejected_reason = ? WHERE id = ? AND state = 'pending'", params: [reason, row.id] })
    unit.announce('core.file.rejected', { fileId: row.id, reason }, { record: ['core.file', row.id] })
    unit.afterCommit(() => store.delete(row.object_key))
    return 'rejected' as const
  }
  const slot = await fileSlot(row.slot)
  if (!slot) return reject('slot-unavailable')
  const object = await store.get(row.object_key)
  if (!object) return reject('missing')
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.length > await slotLimit(slot)) return reject('too-large')
  const kind = sniff(bytes)
  if (!kind || !slot.accepts.includes(kind)) return reject('type-not-accepted')
  let cleaned
  try { cleaned = clean(kind, bytes, { clean: slot.clean }) }
  catch (error) {
    if (error instanceof Rejected) return reject(error.reason)
    throw error
  }
  if (cleaned.bytes.length === 0) return reject('damaged')
  // Stored before the row says ready; a retry reads the cleaned bytes and cleans them again.
  await store.put(row.object_key, cleaned.bytes, { httpMetadata: { contentType: MEDIA_TYPES[kind] } })
  unit.add({
    sql: "UPDATE core_files SET state = 'ready', media_type = ?, byte_size = ?, sha256 = ?, width = ?, height = ?, ready_at = ? WHERE id = ? AND state = 'pending'",
    params: [MEDIA_TYPES[kind], cleaned.bytes.length, await sha256(cleaned.bytes), cleaned.width, cleaned.height, nowMs(), row.id],
  }).expect(1)
  unit.announce('core.file.ready', { fileId: row.id, slot: row.slot }, { record: ['core.file', row.id] })
  return 'ready'
}

/**
 * Attaches a ready file to its owner, in the caller's unit. A slot that holds one file sets aside
 * the file it held, which can be restored until core.files.deleted-retention has passed. A public
 * image needs alt text first (C-23).
 */
export async function attachFile(unit: UnitView, fileId: string, target: { slot: string, ownerType: string, ownerId: string }): Promise<FileRow> {
  const row = await fileRow(fileId)
  if (!row || row.slot !== target.slot || row.owner_type !== target.ownerType || row.owner_id !== target.ownerId) {
    refuse('core.files.not-found', 'There is no such file for this place.', { status: 404 })
  }
  if (row.state === 'pending') refuse('core.files.not-ready', 'The file is still being checked. Try again in a moment.', { status: 409 })
  if (row.state !== 'ready') refuse('core.files.not-ready', 'This file was refused or removed, so it cannot be used.', { status: 409 })
  if (row.access === 'public' && row.media_type.startsWith('image/') && !row.alt_text?.trim()) {
    refuse('core.files.alt-text-required', 'A public image needs a text description before it is used.', { status: 422, fields: { altText: 'required' }, remedy: 'Describe the image for people who cannot see it.' })
  }
  const slot = await fileSlot(row.slot)
  const at = nowMs()
  if (slot && !slot.many) await setAsideOthers(unit, row, at)
  unit.add({ sql: 'UPDATE core_files SET attached_at = ? WHERE id = ? AND state = \'ready\'', params: [at, row.id] }).expect(1)
  unit.audit({ action: 'update', record: ['core.file', row.id], detail: { slot: row.slot } })
  return row
}

async function setAsideOthers(unit: UnitView, row: FileRow, at: number) {
  const keep = await useSetting('core.files.deleted-retention') as number
  unit.add({
    sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?, purge_after = ? WHERE owner_type = ? AND owner_id = ? AND slot = ? AND id != ? AND state = 'ready' AND attached_at IS NOT NULL",
    params: [at, at + keep * 1000, row.owner_type, row.owner_id, row.slot, row.id], // not-policy: seconds to milliseconds
  })
}

/** Removes a file from use. Its bytes stay until core.files.deleted-retention has passed. */
export async function detachFile(unit: UnitView, fileId: string): Promise<void> {
  const keep = await useSetting('core.files.deleted-retention') as number
  const at = nowMs()
  unit.add({ sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?, purge_after = ? WHERE id = ? AND state IN ('ready', 'pending')", params: [at, at + keep * 1000, fileId] }) // not-policy: seconds to milliseconds
  unit.audit({ action: 'delete', record: ['core.file', fileId] })
}
