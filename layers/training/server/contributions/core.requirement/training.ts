// Training's source on core.requirement (amended part 4). References read `training:<competency id>`;
// a host stores one and asks the kit, which asks here. A retired or unknown competency answers
// unavailable, so the host's whenUnavailable decides, as for a module switched off.
import { all, defineRequirementSource, type SourceAnswer } from '#kit'
import { verdicts, type Verdict } from '../../verdicts'

const idOf = (ref: string) => ref.slice('training:'.length)

/** Active competencies by id, with a short line naming their routes in order. */
async function active(ids?: string[]): Promise<Map<string, { title: string, routes: string }>> {
  const rows = await all<{ id: string, title: string, routes: string | null }>(
    `SELECT c.id, c.title, (SELECT group_concat(label, '; ') FROM (SELECT label FROM training_competency_routes r WHERE r.competency_id = c.id AND r.status = 'active' ORDER BY r.position)) AS routes
       FROM training_competencies c WHERE c.status = 'active' ${ids ? 'AND c.id IN (SELECT value FROM json_each(?))' : ''} ORDER BY lower(c.title)`,
    ...(ids ? [JSON.stringify(ids)] : []),
  )
  return new Map(rows.map(r => [r.id, { title: r.title, routes: r.routes ?? '' }]))
}

/** One account's answer on one reference, from the verdicts already worked out. */
function answerFor({ account, ref, live, byPair }: { account: string | null, ref: string, live: Map<string, { title: string }>, byPair: Map<string, Verdict> }): SourceAnswer {
  const id = idOf(ref)
  if (!live.has(id)) return { account, ref, verdict: 'unavailable', summary: 'This competency is no longer kept.' }
  const v = account ? byPair.get(`${account}\u0000${id}`) : undefined
  if (!v) return { account, ref, verdict: 'not-met', reason: 'Sign in to see whether your training counts.', summary: `${live.get(id)!.title}: not checked.` }
  return v.met
    ? { account, ref, verdict: 'met', ...(v.until === null ? {} : { until: v.until }), summary: v.summary, help: v.help }
    : { account, ref, verdict: 'not-met', reason: v.reason ?? undefined, summary: v.summary, help: v.help, remedy: { label: 'See how to get it', to: v.help } }
}

export default defineRequirementSource({
  async options(query) {
    const q = query.trim().toLowerCase()
    return [...(await active())]
      .filter(([, c]) => !q || c.title.toLowerCase().includes(q))
      .map(([id, c]) => ({ reference: `training:${id}`, label: c.title, description: c.routes ? `By: ${c.routes}` : undefined }))
  },

  async describe(refs) {
    const ids = refs.map(idOf)
    const rows = await all<{ id: string, title: string }>('SELECT id, title FROM training_competencies WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
    const titles = new Map(rows.map(r => [r.id, r.title]))
    return Object.fromEntries(refs.map(ref => [ref, { label: titles.get(idOf(ref)) ?? 'A competency no longer kept' }]))
  },

  async check(accountIds, refs, at) {
    const ids = [...new Set(refs.map(idOf))]
    const live = await active(ids)
    const accounts = accountIds.filter((a): a is string => !!a)
    const found = await verdicts(accounts, [...live.keys()], at)
    const byPair = new Map(found.map(v => [`${v.account}\u0000${v.competencyId}`, v]))
    const out: SourceAnswer[] = []
    for (const ref of refs) {
      for (const account of accountIds) out.push(answerFor({ account, ref, live, byPair }))
    }
    return out
  },
})
