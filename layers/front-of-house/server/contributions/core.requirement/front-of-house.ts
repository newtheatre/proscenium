// Front of house's requirement source (FH-5): experience on the rota. front-of-house:worked-<n> is
// met by someone who has worked at least n shifts, and front-of-house:duty-<duty id> by someone who
// has worked that duty before, so a theatre can keep Duty manager for people who have done it.
import { all, defineRequirementSource, first, type SourceAnswer } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { listDuties } from '../../shifts'

const SOURCE = 'front-of-house:'
const COUNTS = [1, 3, 5, 10, 20] // not-policy: the steps offered
const worked = (n: number) => `${SOURCE}worked-${n}`
const shifts = (n: number) => n === 1 ? 'at least 1 shift' : `at least ${n} shifts`

function parse(ref: string): { count: number } | { dutyId: string } | null {
  const id = ref.slice(SOURCE.length)
  if (id.startsWith('worked-')) {
    const count = Number(id.slice('worked-'.length))
    return Number.isInteger(count) && count > 0 ? { count } : null
  }
  return id.startsWith('duty-') ? { dutyId: id.slice('duty-'.length) } : null
}

async function dutyName(id: string): Promise<string | null> {
  return (await first<{ name: string }>('SELECT name FROM front_of_house_duties WHERE id = ?', id))?.name ?? null
}

export default defineRequirementSource({
  async options(query) {
    const q = query.trim().toLowerCase()
    return [
      ...COUNTS.map(n => ({ reference: worked(n), label: `Has worked ${shifts(n)}` })),
      ...(await listDuties()).map(d => ({ reference: `${SOURCE}duty-${d.id}`, label: `Has worked as ${d.name} before` })),
    ].filter(o => !q || o.label.toLowerCase().includes(q))
  },

  async describe(refs) {
    const out: Record<string, { label: string }> = {}
    for (const ref of refs) {
      const what = parse(ref)
      if (!what) continue
      out[ref] = { label: 'count' in what ? `Has worked ${shifts(what.count)}` : `Has worked as ${await dutyName(what.dutyId) ?? 'a duty no longer used'} before` }
    }
    return out
  },

  async check(accounts, refs) {
    const out: SourceAnswer[] = []
    for (const account of accounts) {
      const done = account
        ? await all<{ duty_id: string, n: number }>(
            `SELECT s.duty_id, count(*) AS n FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
              WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state = 'worked' GROUP BY s.duty_id`, account)
        : []
      const total = done.reduce((sum, d) => sum + d.n, 0)
      for (const ref of refs) {
        const what = parse(ref)
        if (!what) {
          out.push({ account, ref, verdict: 'not-met', reason: 'This requirement is not recognised.' })
          continue
        }
        if ('count' in what) {
          out.push(total >= what.count
            ? { account, ref, verdict: 'met', summary: `Has worked ${total} shifts.` }
            : { account, ref, verdict: 'not-met', reason: `This duty is for people who have worked ${shifts(what.count)}.`, summary: `Has worked ${total} shifts.` })
          continue
        }
        const name = await dutyName(what.dutyId)
        out.push(done.some(d => d.duty_id === what.dutyId)
          ? { account, ref, verdict: 'met' }
          : { account, ref, verdict: 'not-met', reason: `This duty is for people who have worked as ${name ?? 'that duty'} before.` })
      }
    }
    return out
  },
})
