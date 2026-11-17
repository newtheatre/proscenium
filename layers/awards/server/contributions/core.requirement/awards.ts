// Awards' source on core.requirement: the price an award carries, such as a fellow's ticket.
// References are `awards:<type id>` and `awards:benefit`, which any current award of a type that
// carries a ticket price meets. A host such as Box office stores them on a ticket type and never
// learns what they mean.
//
// It answers by account only: an award has no number to type, so its holder signs in, or shows
// their card to a seller who may check. Evidence is the award's id, and one award grants one ticket.
import { all, defineRequirementSource, type SourceAnswer } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getType, listTypes } from '../../types'

const BENEFIT = 'benefit'
const NO_LONGER = 'An award no longer given'
const typeIdOf = (ref: string) => ref.slice('awards:'.length)

interface Held { id: string, typeId: string, typeName: string }

/** The current awards an account holds that count for a reference, oldest first. */
async function heldBy(accountId: string, ref: string): Promise<Held[]> {
  const held = await all<Held & { benefit: number }>(
    `SELECT a.id, a.type_id AS typeId, t.name AS typeName, t.gives_ticket_benefit AS benefit FROM awards_awards a JOIN awards_types t ON t.id = a.type_id WHERE a.state = 'current' AND a.account_id IN (${accountScopeSql('?1')}) ORDER BY a.awarded_on, a.id`,
    accountId,
  )
  return held.filter(a => ref === BENEFIT ? !!a.benefit : a.typeId === ref)
}

export default defineRequirementSource({
  checkAbility: 'awards.award.check',

  async options(query) {
    const q = query.trim().toLowerCase()
    return [
      { reference: `awards:${BENEFIT}`, label: 'Any award that carries a ticket price' },
      ...(await listTypes()).filter(t => t.state === 'active').map(t => ({ reference: `awards:${t.id}`, label: t.name, description: t.summary ?? undefined })),
    ].filter(o => !q || o.label.toLowerCase().includes(q))
  },

  async describe(refs) {
    const out: Record<string, { label: string }> = {}
    for (const ref of refs) {
      const id = typeIdOf(ref)
      out[ref] = { label: id === BENEFIT ? 'Award holders' : (await getType(id))?.name ?? NO_LONGER }
    }
    return out
  },

  async check(accountIds, refs) {
    const out: SourceAnswer[] = []
    for (const fullRef of refs) {
      const ref = typeIdOf(fullRef)
      const gone = ref !== BENEFIT && !(await getType(ref))
      for (const account of accountIds) {
        const held = account ? await heldBy(account, ref) : []
        out.push(held.length
          ? { account, ref: fullRef, verdict: 'met', evidence: held[0]!.id, quantity: 1, summary: `${held[0]!.typeName}: current.` }
          : { account, ref: fullRef, verdict: 'not-met', reason: gone ? 'This price is for an award that is no longer given.' : 'This price is for holders of an award.', summary: 'Holds no such award.' })
      }
    }
    return out
  },
})
