// Members for staff (tab 5, "Members"): one page of the list. See server/members.ts.
import { getQuery } from 'nuxt/server'
import { defineRoute } from '#kit'
import { readMembers } from '../../../members'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, (event, { actor, unit }) =>
  readMembers(getQuery(event) as Record<string, string | string[] | undefined>, actor, unit.view()))
