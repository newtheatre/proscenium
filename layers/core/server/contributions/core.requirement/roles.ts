// Roles as a requirement source (FH-5): core.role:<role id> is met by someone who holds that role
// site-wide now, such as a duty only people with the Duty manager role may take. The role's name is
// the label; an archived role is met by nobody.
import { all, defineRequirementSource, type SourceAnswer } from '#kit'
import { OWNER, liveGrantsOf } from '../../identity/grants'

const PREFIX = 'core.role:'
const NO_LONGER = 'A role no longer in use'

async function roles(): Promise<{ id: string, name: string, archived: boolean }[]> {
  return (await all<{ id: string, name: string, archived_at: number | null }>('SELECT id, name, archived_at FROM core_roles WHERE key <> ? ORDER BY name', OWNER))
    .map(r => ({ id: r.id, name: r.name, archived: r.archived_at !== null }))
}

export default defineRequirementSource({
  async options(query) {
    const q = query.trim().toLowerCase()
    return (await roles()).filter(r => !r.archived && (!q || r.name.toLowerCase().includes(q))).map(r => ({ reference: `${PREFIX}${r.id}`, label: `Holds the role ${r.name}` }))
  },

  async describe(refs) {
    const byId = new Map((await roles()).map(r => [r.id, r]))
    return Object.fromEntries(refs.map((ref) => {
      const role = byId.get(ref.slice(PREFIX.length))
      return [ref, { label: role && !role.archived ? `Holds the role ${role.name}` : NO_LONGER }]
    }))
  },

  async check(accounts, refs) {
    const byId = new Map((await roles()).map(r => [r.id, r]))
    const out: SourceAnswer[] = []
    for (const account of accounts) {
      const held = account ? await liveGrantsOf(account) : []
      for (const ref of refs) {
        const role = byId.get(ref.slice(PREFIX.length))
        const holds = !!role && !role.archived && held.some(g => g.role_id === role.id && g.scope === 'site')
        out.push(holds
          ? { account, ref, verdict: 'met' }
          : { account, ref, verdict: 'not-met', reason: role ? `This needs the role ${role.name}.` : 'This needs a role that is no longer in use.' })
      }
    }
    return out
  },
})
