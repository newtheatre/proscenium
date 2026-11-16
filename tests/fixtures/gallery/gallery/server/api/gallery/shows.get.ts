// Sample shows for the list with views and rows that open. Reads its address with the shared codec,
// as the kit's readList does, so the browser test proves the two agree.
import { defineRoute, refuse } from '#kit'
import { decodeList } from '../../../../../../../layers/core/shared/list'
import { showsList } from '../../../shared/shows'

const shows = [
  { id: 'show-1', title: 'Hamlet', opens: '2026-11-20', changed: 5, state: 'on-sale', listed: true, venue: 'Main House' },
  { id: 'show-2', title: 'Macbeth', opens: '2026-12-02', changed: 4, state: 'on-sale', listed: true, venue: 'Studio' },
  { id: 'show-3', title: 'Twelfth Night', opens: '2027-01-14', changed: 3, state: 'draft', listed: false, venue: 'Main House' },
  { id: 'show-4', title: 'The Tempest', opens: '2026-09-01', changed: 2, state: 'past', listed: true, venue: 'Studio' },
  { id: 'show-5', title: 'Othello', opens: '2027-02-10', changed: 1, state: 'draft', listed: true, venue: 'Main House' },
].map(s => ({ ...s, performances: [1, 2, 3].map(n => ({ id: `${s.id}-p${n}`, when: `${s.opens} 19:30 (${n})`, venue: s.venue, state: s.state === 'draft' ? 'Draft' : 'Scheduled' })) }))

export default defineRoute({ ability: 'gallery.sample.view', rateLimit: 'default' }, (event) => {
  const read = decodeList(getQuery(event) as Record<string, string>, showsList, { today: '2026-11-16' })
  if (!read.ok) refuse('core.list.unknown', read.reason, { status: 422, fields: { [read.key]: 'core.list.unknown' } })
  const q = read.value
  const state = q.filters.state as string[] | undefined
  const listed = q.filters.listed as boolean | undefined
  const opens = q.filters.opens as { from?: string, to?: string } | undefined
  let found = shows.filter(s => (!state || state.includes(s.state)) && (listed === undefined || s.listed === listed) && (!opens || ((!opens.from || s.opens >= opens.from) && (!opens.to || s.opens <= opens.to))))
  found = found.filter(s => q.words.every(w => `${s.title} ${s.venue} ${s.state}`.toLowerCase().includes(w)))
  const key = q.sort.key === 'title' ? 'title' : q.sort.key === 'opens' ? 'opens' : 'changed'
  found = [...found].sort((a, b) => (a[key] > b[key] ? 1 : -1) * (q.sort.order === 'desc' ? -1 : 1))
  return { rows: found.slice((q.page - 1) * q.size, q.page * q.size), total: found.length }
})
