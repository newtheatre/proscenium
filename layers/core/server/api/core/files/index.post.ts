// Uploads one file into a slot (C-23, C-36). The body is the file's bytes; the slot, the owner and
// the file's name come in the query. The file is stored at once and checked by a job; it is not
// served until it is ready. Uploading needs the ability to edit the owner, which the slot names.
import { getHeader, readRawBody } from 'h3'
import { z } from 'zod'
import { defineRoute, files as store, newId, nowMs, refuse, requireAbility, useContext } from '#kit'
import { fileSlot, sha256, slotLimit } from '../../../files/service'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  body: 'binary',
  input: z.object({
    slot: z.string().min(1),
    owner: z.string().min(1).default('site'),
    name: z.string().max(255).optional(), // not-policy: the specification's column limit
  }),
}, async (event, { input, actor, unit }) => {
  const slot = await fileSlot(input.slot)
  if (!slot) refuse('core.files.unknown-slot', `There is no file slot called ${input.slot}.`, { status: 404 })
  if (slot.source === 'server') refuse('core.files.not-uploadable', 'Files in this place are made by Proscenium, not uploaded.', { status: 403 })
  if (slot.owner === 'site' && input.owner !== 'site') refuse('core.files.not-found', 'There is no such place for a file.', { status: 404 })
  const context = useContext()
  context.allowedBy = await requireAbility(actor, slot.ability as any, slot.owner === 'site' ? undefined : [slot.owner, input.owner])
  context.ability = slot.ability

  const limit = await slotLimit(slot)
  const tooLarge = () => refuse('core.files.too-large', 'This file is larger than this place takes.', { status: 413, fields: { file: 'too-large' } })
  if (Number(getHeader(event, 'content-length') ?? 0) > limit) tooLarge()
  const body = await readRawBody(event, false)
  const bytes = body ? new Uint8Array(body) : new Uint8Array()
  if (bytes.length === 0) refuse('core.files.empty', 'The file is empty.', { status: 422, fields: { file: 'empty' } })
  if (bytes.length > limit) tooLarge()

  const id = newId('fil', { random: true })
  const objectKey = `files/${crypto.randomUUID()}`
  await store.put(objectKey, bytes)
  unit.add({
    sql: "INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, original_name, text_class, media_type, byte_size, sha256, access, state, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'application/octet-stream', ?, ?, ?, 'pending', ?, ?)",
    params: [id, objectKey, slot.owner, input.owner, slot.id, input.name ?? null, slot.textClass, bytes.length, await sha256(bytes), slot.access, actor.accountId ?? null, nowMs()],
  })
  unit.enqueue('core.check-file', { fileId: id })
  unit.audit({ action: 'create', record: ['core.file', id], detail: { slot: slot.id } })
  return { id, state: 'pending', url: `/files/${id}` }
})
