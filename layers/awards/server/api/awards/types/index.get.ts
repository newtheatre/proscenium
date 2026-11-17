// Every award type, archived ones too, with how many hold each now: the lists in Admin and the console.
import { all, defineRoute } from '#kit'
import { listTypes } from '../../../types'

export default defineRoute({ ability: 'awards.type.view', rateLimit: 'default' }, async () => {
  const counts = await all<{ type_id: string, n: number }>("SELECT type_id, count(*) AS n FROM awards_awards WHERE state = 'current' GROUP BY type_id")
  const held = new Map(counts.map(c => [c.type_id, c.n]))
  return { types: (await listTypes()).map(t => ({ ...t, holders: held.get(t.id) ?? 0 })) }
})
