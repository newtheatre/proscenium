// Comps requests waiting for a decision this person may make, on the console home card. The ability
// refuses the requester, so their own requests are not counted for them.
import { sql } from 'drizzle-orm'
import { can, type Actor } from '#kit'
import { compsWhere } from '../../comps'

export default {
  async value(actor: Actor) {
    let n = 0
    for (const r of await compsWhere(sql`state = 'requested'`)) {
      if ((await can(actor, 'box-office.comp.approve', ['box-office.comp-request', r.id])).allowed) n++
    }
    return n
  },
}
