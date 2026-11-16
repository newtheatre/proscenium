// Shows records the same way wherever they are listed: each type's `core.record-resolver` turns an
// id into a title and an address. Only types the viewer may search are resolved.
import { z } from 'zod'
import { defineRoute, usePoint } from '#kit'
import { holds, mayOpen } from '../../interface/navigation'
import type { RecordResolver } from '../../points/record-resolver'

interface Source { record: string, ability: string | string[] }

const MOST_IDS = 20 // not-policy: one page of palette results

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ type: z.string(), ids: z.string().max(2000).transform(s => s.split(',').filter(Boolean).slice(0, MOST_IDS)) }), // not-policy: a sane length for a list of ids
}, async (_event, { input, actor }) => {
  let allowed = false
  for (const { value } of await usePoint<Source>('core.search-source')) {
    if (value.record === input.type && holds(await mayOpen(actor, { ability: value.ability }))) allowed = true
  }
  if (!allowed) return { records: [] }
  const resolver = (await usePoint<RecordResolver>('core.record-resolver')).find(r => r.id === input.type)
  if (!resolver) return { records: [] }
  const records: { type: string, id: string, title: string, to?: string }[] = []
  for (const id of input.ids) {
    const found = await resolver.value.resolve(id)
    if (found) records.push({ type: input.type, id, title: found.title, to: found.to })
  }
  return { records }
})
