// Membership's source on core.requirement (tab 4, "The requirement source"; MEM-35, MEM-58): the
// member price. References are `membership:<scheme id>` and `membership:any`. A host such as Box
// office stores them on a ticket type and never learns what they mean.
//
// This slice answers by account, and by a member number presented in place of signing in where the
// scheme accepts a reference (V8 to V11). Student IDs from an uploaded list are a later slice: until
// then the evidence is always the membership's id (V11 has the entry's id once lists exist).
import { all, defineRequirementSource, first, localDate, useSetting, type SourceAnswer } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { getScheme, listSchemes, type Scheme } from '../../schemes'

const ANY = 'any'
const NO_LONGER = 'A membership no longer offered'

interface Held { id: string, schemeId: string, schemeName: string, accountId: string, endsOn: string | null, graceDays: number, acceptsReference: number }

// D1 at a given day, as SQL. ?1 is the day.
const CURRENT_ON = 'm.state = \'active\' AND m.starts_on <= ?1 AND (m.ends_on IS NULL OR date(m.ends_on, \'+\' || s.grace_days || \' days\') >= ?1)'
const HELD = `SELECT m.id, m.scheme_id AS schemeId, s.name AS schemeName, m.account_id AS accountId, m.ends_on AS endsOn, s.grace_days AS graceDays, s.accepts_reference AS acceptsReference
  FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id`

/** The current memberships an account holds on a day, latest end first. */
async function heldBy(accountId: string, day: string): Promise<Held[]> {
  return all<Held>(`${HELD} WHERE ${CURRENT_ON} AND m.account_id IN (${accountScopeSql('?2')}) ORDER BY coalesce(m.ends_on, '9999-12-31') DESC`, day, accountId)
}

/** The surviving account a membership belongs to now. */
async function survivor(accountId: string): Promise<string> {
  return (await first<{ id: string }>('SELECT coalesce(merged_into_id, id) AS id FROM core_accounts WHERE id = ?', accountId))?.id ?? accountId
}

const matches = (ref: string, m: Held) => ref === ANY || m.schemeId === ref
const schemeIdOf = (ref: string) => ref.slice('membership:'.length)

/** "M-412", "m412" and "412" all name member 412. Anything else is not a member number. */
async function memberNumberOf(value: string): Promise<number | null> {
  const prefix = String(await useSetting('membership.numbers.prefix') ?? '').trim().toLowerCase()
  let text = value.trim().toLowerCase().replace(/\s+/g, '')
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length)
  return /^\d{1,9}$/.test(text) ? Number(text) : null // not-policy: the shape of a member number
}

function metFor(m: Held, withHolder: boolean): Omit<SourceAnswer, 'account' | 'ref'> {
  const until = m.endsOn ? `current until ${m.endsOn}` : 'current, with no end date'
  return {
    verdict: 'met',
    evidence: m.id,
    summary: withHolder ? `Member by reference: ${until}. Ask to see the card.` : `Member: ${until}.`,
    ...(withHolder ? { holderAccountId: m.accountId } : {}),
  }
}

export default defineRequirementSource({
  checkAbility: 'membership.card.check',
  holderAbility: 'membership.verification-list.check',

  async options(query) {
    const q = query.trim().toLowerCase()
    const schemes = await listSchemes(['open', 'closed'])
    return [
      { reference: `membership:${ANY}`, label: 'Any current membership' },
      ...schemes.map(s => ({ reference: `membership:${s.id}`, label: s.name, description: s.summary ?? undefined })),
    ].filter(o => !q || o.label.toLowerCase().includes(q))
  },

  async describe(refs) {
    const out: Record<string, { label: string, presentable?: { label: string, shape: string } }> = {}
    for (const ref of refs) {
      const id = schemeIdOf(ref)
      if (id === ANY) {
        out[ref] = { label: 'Members' }
        continue
      }
      const scheme = await getScheme(id)
      if (!scheme || scheme.state === 'archived') {
        out[ref] = { label: NO_LONGER }
        continue
      }
      // V13: the label names the scheme, never a bare noun.
      out[ref] = scheme.acceptsReference
        ? { label: scheme.name, presentable: { label: `${scheme.name}? Enter your member number`, shape: 'member-number' } }
        : { label: scheme.name }
    }
    return out
  },

  async check(accountIds, refs, at, _record, presented) {
    const day = await localDate(at)
    const out: SourceAnswer[] = []
    const schemes = new Map<string, Scheme | null>()
    const schemeOf = async (id: string) => {
      if (!schemes.has(id)) schemes.set(id, await getScheme(id))
      return schemes.get(id)!
    }
    const help = String(await useSetting('membership.help.link') ?? '') || undefined

    for (const fullRef of refs) {
      const ref = schemeIdOf(fullRef)
      const scheme = ref === ANY ? null : await schemeOf(ref)
      const offered = presented?.find(p => p.ref === fullRef)

      for (const account of accountIds) {
        // The account is judged first: a signed-in holder is never asked for their own reference.
        if (account) {
          const held = (await heldBy(account, day)).filter(m => matches(ref, m))
          if (held.length) {
            out.push({ account, ref: fullRef, ...metFor(held[0]!, false) })
            continue
          }
        }
        if (offered && (ref === ANY || scheme?.acceptsReference)) {
          let m: Held | undefined
          if ('evidence' in offered) {
            // Judged afresh: holding the evidence proves nothing by itself.
            m = (await all<Held>(`${HELD} WHERE ${CURRENT_ON} AND m.id = ?2`, day, offered.evidence))[0]
          }
          else {
            const number = await memberNumberOf(offered.value)
            if (number === null) {
              out.push({ account, ref: fullRef, verdict: 'not-met', reason: 'That is not a member number. It is the number on your membership card, such as M-412.', summary: 'Not a member number.' })
              continue
            }
            const holder = await first<{ account_id: string }>('SELECT account_id FROM membership_members WHERE number = ?', number)
            if (holder) m = (await heldBy(holder.account_id, day))[0]
          }
          if (m && matches(ref, m) && m.acceptsReference) {
            out.push({ account, ref: fullRef, ...metFor({ ...m, accountId: await survivor(m.accountId) }, true) })
            continue
          }
          // V15: a miss reads the same whoever the number belongs to, and carries no name.
          out.push({ account, ref: fullRef, verdict: 'not-met', reason: 'We could not find a current membership for that number. Have a membership? Contact us.', help, summary: 'No current membership found for the reference given.' })
          continue
        }
        out.push({
          account,
          ref: fullRef,
          verdict: 'not-met',
          reason: ref !== ANY && (!scheme || scheme.state === 'archived') ? 'This price is for a membership that is no longer offered.' : 'This price is for members.',
          summary: 'Not a member.',
        })
      }
    }
    return out
  },

  // The name to compare with the card shown, for staff only (V18). For a member number it is the
  // holder's account name.
  async holder(evidence) {
    const row = await first<{ name: string | null }>(
      'SELECT a.name FROM membership_memberships m JOIN core_accounts a ON a.id = m.account_id WHERE m.id = ?',
      evidence,
    )
    return row?.name ?? null
  },
})
