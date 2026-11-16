// Sets a file's title and alt text. Needs the ability to edit its owner.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, requireAbility, useContext } from '#kit'
import { fileRow, fileSlot } from '../../../files/service'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    title: z.string().trim().max(120).nullable().optional(), // not-policy: the specification's column limit
    altText: z.string().trim().max(300).nullable().optional(), // not-policy: the specification's column limit
  }),
}, async (event, { input, actor, unit }) => {
  const row = await fileRow(getRouterParam(event, 'id') ?? '')
  if (!row || row.state === 'deleted' || row.state === 'rejected') refuse('core.files.not-found', 'There is no such file.', { status: 404 })
  const slot = await fileSlot(row.slot)
  if (!slot) refuse('core.files.not-found', 'There is no such file.', { status: 404 })
  const context = useContext()
  context.allowedBy = await requireAbility(actor, slot.ability as any, row.owner_type === 'site' ? undefined : [row.owner_type, row.owner_id])
  context.ability = slot.ability
  const title = input.title === undefined ? row.title : input.title || null
  const altText = input.altText === undefined ? row.alt_text : input.altText || null
  unit.add({ sql: 'UPDATE core_files SET title = ?, alt_text = ? WHERE id = ?', params: [title, altText, row.id] })
  unit.audit({ action: 'update', record: ['core.file', row.id] })
  return { id: row.id, title, altText }
})
