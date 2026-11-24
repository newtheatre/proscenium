// The gallery company for Find a time's browser test: everyone holding a role whose key starts
// "avail-" is in it and plans for it. Written without Availability's types, which the gallery only uses.
import { sql } from 'drizzle-orm'
import { useDb } from '#kit'

const GROUP = { id: 'gallery:company', label: 'Gallery company' }
const members = sql`SELECT g.account_id AS id FROM core_grants g JOIN core_roles r ON r.id = g.role_id WHERE r.key LIKE 'avail-%'`
const isMember = async (accountId: string) => !!(await useDb().get(sql`SELECT 1 AS one FROM (${members}) WHERE id = ${accountId}`))

export default {
  prefix: 'gallery:',
  list: async (viewerId: string) => (await isMember(viewerId)) ? [GROUP] : [],
  members: () => members,
  canPlan: async (viewerId: string, groupId: string) => groupId === GROUP.id && await isMember(viewerId),
  groupsOf: async (accountId: string) => (await isMember(accountId)) ? [{ ...GROUP, plannedBy: 'Everyone in it' }] : [],
}
