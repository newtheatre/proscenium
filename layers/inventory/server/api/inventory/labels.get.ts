// The labels for a print sheet (S11): tag, name and department of each item asked for that this
// person may see, and the size the theatre prints at (inventory.labels.size).
import { getQuery } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { z } from 'zod'
import { departmentsFor, labelsFor } from '../../reading'

const ids = z.array(z.string().min(1).max(40)).min(1).max(200) // not-policy: shape bound

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const asked = ids.safeParse(String(getQuery(event).items ?? '').split(',').filter(Boolean))
  if (!asked.success) return refuse('inventory.labels.which', 'Choose the items to print labels for.', { status: 422 })
  const seen = new Set((await departmentsFor(actor, 'inventory.item.view')).map(d => d.id))
  const labels = (await labelsFor(asked.data)).filter(l => seen.has(l.departmentId))
  return { size: await useSetting('inventory.labels.size') as 'small' | 'large', labels }
})
