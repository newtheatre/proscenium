// One award type, with how many hold it, whether it can still be deleted, and whether the form
// builder is on, so its page can offer nominations.
import { getRouterParam } from 'nuxt/server'
import { can, defineRoute, first, isEnabled } from '#kit'
import { hasAwards, requireType } from '../../../types'

export default defineRoute({ ability: 'awards.type.view', record: event => ['awards.type', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default' }, async (_event, { actor, record }) => {
  const type = await requireType(record!.id)
  const holders = (await first<{ n: number }>("SELECT count(*) AS n FROM awards_awards WHERE type_id = ? AND state = 'current'", type.id))?.n ?? 0
  return {
    type,
    holders,
    deletable: !(await hasAwards(type.id)),
    canManage: (await can(actor, 'awards.type.manage', ['awards.type', type.id])).allowed,
    nominations: await isEnabled('forms'),
    canIssue: (await can(actor, 'awards.award.issue', ['awards.type', type.id])).allowed,
  }
})
