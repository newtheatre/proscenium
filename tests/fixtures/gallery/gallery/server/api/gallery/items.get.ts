// Sample rows for the list page: sixty items to search, filter, sort and page.
import { z } from 'zod'
import { defineRoute } from '#kit'

const rows = Array.from({ length: 60 }, (_, i) => ({
  id: `item-${i + 1}`,
  name: `${['Hamlet', 'Macbeth', 'Twelfth Night', 'The Tempest', 'Othello', 'King Lear'][i % 6]} ${Math.floor(i / 6) + 1}`,
  status: ['draft', 'on-sale', 'sold-out'][i % 3]!,
  seats: 20 + i,
}))

export default defineRoute({
  ability: 'gallery.sample.view',
  rateLimit: 'default',
  input: z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(25),
    format: z.string().optional(),
  }),
}, async (_event, { input }) => {
  let found = rows.filter(r => (!input.q || r.name.toLowerCase().includes(input.q.toLowerCase())) && (!input.status || r.status === input.status))
  if (input.sort === 'name' || input.sort === 'seats') {
    const key = input.sort
    found = [...found].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (input.order === 'desc' ? -1 : 1))
  }
  return { rows: found.slice((input.page - 1) * input.size, input.page * input.size), total: found.length }
})
