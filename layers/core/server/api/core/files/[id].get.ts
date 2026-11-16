// One file's details, for the person who uploaded it or anyone who may edit its owner.
import { getRouterParam } from 'h3'
import { defineRoute, can, refuse } from '#kit'
import { fileRow, fileSlot, fileUrl } from '../../../files/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const row = await fileRow(getRouterParam(event, 'id') ?? '')
  const notFound = () => refuse('core.files.not-found', 'There is no such file.', { status: 404 })
  if (!row) return notFound()
  const slot = await fileSlot(row.slot)
  const mine = !!actor.accountId && row.uploaded_by === actor.accountId
  if (!mine && !(slot && (await can(actor, slot.ability as any, row.owner_type === 'site' ? undefined : [row.owner_type, row.owner_id])).allowed)) notFound()
  return {
    id: row.id, slot: row.slot, state: row.state, rejectedReason: row.rejected_reason, mediaType: row.media_type, byteSize: row.byte_size,
    width: row.width, height: row.height, title: row.title, altText: row.alt_text, url: row.state === 'ready' ? fileUrl(row.id) : null,
  }
})
