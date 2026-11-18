// Membership's source on core.requirement (tab 4, "The requirement source"; MEM-35, MEM-58): the
// member price. References are `membership:<scheme id>` and `membership:any`. A host such as Box
// office stores them on a ticket type and never learns what they mean.
//
// It answers by account, and, where the scheme accepts a reference (V8 to V11), by a reference
// presented in place of signing in: an entry on the scheme's list (a student ID) or a member number.
// Evidence is the list entry's id where one exists, otherwise the membership's id (V11).
import { all, defineRequirementSource, first, localDate, useSetting, type SourceAnswer } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findEntry, getList, normalise, schemeList, wellFormed, type ListRow } from '../../lists'
import { getScheme, listSchemes, type Scheme } from '../../schemes'
import { shapeText } from '../../verify'

const ANY = 'any'
const NO_LONGER = 'A membership no longer offered'

interface Held { id: string, schemeId: string, schemeName: string, accountId: string, endsOn: string | null, graceDays: number, acceptsReference: number, entryId: string | null }

// D1 at a given day, as SQL. ?1 is the day.
const CURRENT_ON = 'm.state = \'active\' AND m.starts_on <= ?1 AND (m.ends_on IS NULL OR date(m.ends_on, \'+\' || s.grace_days || \' days\') >= ?1)'
const HELD = `SELECT m.id, m.scheme_id AS schemeId, s.name AS schemeName, m.account_id AS accountId, m.ends_on AS endsOn, s.grace_days AS graceDays, s.accepts_reference AS acceptsReference,
  (SELECT e.id FROM membership_verification_entries e WHERE e.used_by = m.id) AS entryId
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
const MINE = '/account/membership'

/** The last day of the latest membership of this account that has lapsed (past its end and grace), for a reference. */
async function lastLapsed(accountId: string, ref: string, day: string): Promise<string | null> {
  const row = await first<{ endsOn: string }>(
    `SELECT m.ends_on AS endsOn FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'active' AND m.ends_on IS NOT NULL
        AND date(m.ends_on, '+' || s.grace_days || ' days') < ?2 ${ref === ANY ? '' : 'AND m.scheme_id = ?'}
      ORDER BY m.ends_on DESC LIMIT 1`,
    accountId, day, ...(ref === ANY ? [] : [ref]),
  )
  return row?.endsOn ?? null
}

/** Whether somebody could join a scheme this reference counts, themselves, now. */
async function mayJoin(ref: string, scheme: Scheme | null): Promise<boolean> {
  const schemes = ref === ANY ? await listSchemes(['open']) : scheme?.state === 'open' ? [scheme] : []
  return schemes.some(s => s.joinMode === 'apply')
}

/** A day written out for a sentence, in the theatre's language: "1 October 2026". */
async function longDate(day: string): Promise<string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${day}T00:00:00Z`))
}

interface Entry { id: string, endsOn: string | null, usedBy: string | null }

/** A list entry judged on a day, with the membership that claimed it if that is current. */
async function entryAnswer(list: ListRow, entry: Entry): Promise<Omit<SourceAnswer, 'account' | 'ref'>> {
  const claimed = entry.usedBy ? (await all<Held>(`${HELD} WHERE m.id = ?1`, entry.usedBy))[0] : undefined
  const until = entry.endsOn ? `current until ${entry.endsOn}` : list.validUntil ? `current until ${list.validUntil}` : 'current'
  return {
    verdict: 'met',
    evidence: entry.id,
    summary: `Member by reference: ${until}. Ask to see the card.`,
    ...(claimed ? { holderAccountId: await survivor(claimed.accountId) } : {}),
  }
}

/** The entry an evidence id names, if it still matches on the day (judged afresh, V11). */
async function entryByEvidence(evidence: string, day: string): Promise<{ list: ListRow, entry: Entry } | null> {
  const row = await first<{ listId: string }>('SELECT list_id AS listId FROM membership_verification_entries WHERE id = ?', evidence)
  if (!row) return null
  const list = await getList(row.listId)
  if (!list || (list.validUntil && list.validUntil < day)) return null
  const entry = await first<Entry>('SELECT id, ends_on AS endsOn, used_by AS usedBy FROM membership_verification_entries WHERE id = ?1 AND (ends_on IS NULL OR ends_on >= ?2)', evidence, day)
  return entry ? { list, entry } : null
}

/** The lists a reference may name: the scheme's, or for "any", every list of a scheme that accepts references. */
async function listsFor(ref: string, scheme: Scheme | null): Promise<{ list: ListRow, schemeId: string }[]> {
  const schemes = ref === ANY ? (await listSchemes(['open', 'closed'])).filter(s => s.acceptsReference) : scheme?.acceptsReference ? [scheme] : []
  const out: { list: ListRow, schemeId: string }[] = []
  for (const s of schemes) {
    const list = await schemeList(s)
    if (list?.keyKind === 'reference') out.push({ list, schemeId: s.id })
  }
  return out
}
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
    evidence: m.entryId ?? m.id,
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
    const out: Record<string, { label: string, presentable?: { label: string, field?: string, shape: string } }> = {}
    const presentableOf = async (scheme: Scheme) => {
      const list = await schemeList(scheme)
      // The list's label is a whole phrase (V13), so it is the field's own name and never set inside a sentence.
      return list?.keyKind === 'reference'
        ? { label: `${scheme.name}: type your reference to get this price`, field: list.referenceLabel ?? 'Membership reference', shape: list.referenceShape ? `${list.referenceShape.kind}:${list.referenceShape.min}-${list.referenceShape.max}` : 'reference' }
        : { label: `${scheme.name}: type your member number to get this price`, field: 'Member number', shape: 'member-number' }
    }
    for (const ref of refs) {
      const id = schemeIdOf(ref)
      if (id === ANY) {
        // Any membership: a reference is taken where some scheme takes one. With one such scheme its
        // own words (V13); with several, words that fit them all.
        const taking = (await listSchemes(['open', 'closed'])).filter(s => s.acceptsReference)
        out[ref] = taking.length === 1
          ? { label: 'Members', presentable: await presentableOf(taking[0]!) }
          : taking.length ? { label: 'Members', presentable: { label: 'Members: type your membership reference to get this price', field: 'Membership reference', shape: 'reference' } } : { label: 'Members' }
        continue
      }
      const scheme = await getScheme(id)
      if (!scheme || scheme.state === 'archived') {
        out[ref] = { label: NO_LONGER }
        continue
      }
      // V13: the label names the scheme, never a bare noun. A list's own label where it has one.
      out[ref] = scheme.acceptsReference ? { label: scheme.name, presentable: await presentableOf(scheme) } : { label: scheme.name }
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
          const lists = await listsFor(ref, scheme)
          if ('evidence' in offered) {
            // Judged afresh: holding the evidence proves nothing by itself.
            const byEntry = await entryByEvidence(offered.evidence, day)
            if (byEntry && lists.some(l => l.list.id === byEntry.list.id)) {
              out.push({ account, ref: fullRef, ...(await entryAnswer(byEntry.list, byEntry.entry)) })
              continue
            }
            m = (await all<Held>(`${HELD} WHERE ${CURRENT_ON} AND m.id = ?2`, day, offered.evidence))[0]
          }
          else {
            // A list entry first: a student ID may look like a member number.
            let found = false
            for (const { list } of lists) {
              if (!wellFormed(list.referenceShape, normalise('reference', offered.value))) continue
              const entry = await findEntry(list, offered.value, day)
              if (entry) {
                out.push({ account, ref: fullRef, ...(await entryAnswer(list, entry)) })
                found = true
                break
              }
            }
            if (found) continue
            const number = await memberNumberOf(offered.value)
            const shaped = lists.some(({ list }) => wellFormed(list.referenceShape, normalise('reference', offered.value)))
            if (number === null && !shaped) {
              // V15: not well formed, so say what one looks like.
              const sample = lists[0]?.list
              const reason = sample ? shapeText(sample.referenceShape) : 'That is not a member number. It is the number on your membership card, such as M-412.'
              out.push({ account, ref: fullRef, verdict: 'not-met', reason, summary: 'Not a well-formed reference.' })
              continue
            }
            const holder = number === null ? null : await first<{ account_id: string }>('SELECT account_id FROM membership_members WHERE number = ?', number)
            if (holder) m = (await heldBy(holder.account_id, day))[0]
          }
          if (m && matches(ref, m) && m.acceptsReference) {
            out.push({ account, ref: fullRef, ...metFor({ ...m, accountId: await survivor(m.accountId) }, true) })
            continue
          }
          // V15: a miss reads the same whoever the value belongs to, and carries no name. Where the
          // scheme has a list, it speaks of the list's reference, or says what one looks like.
          const list = lists[0]?.list
          const typedValue = 'value' in offered ? normalise('reference', offered.value) : null
          const reason = !list || typedValue === null
            ? 'We could not find a current membership for that number. Have a membership? Contact us.'
            : lists.some(l => wellFormed(l.list.referenceShape, typedValue))
              ? 'We could not find a current membership with that reference. Have a membership? Contact us.'
              : shapeText(list.referenceShape)
          out.push({ account, ref: fullRef, verdict: 'not-met', reason, help, summary: 'No current membership found for the reference given.' })
          continue
        }
        if (ref !== ANY && (!scheme || scheme.state === 'archived')) {
          out.push({ account, ref: fullRef, verdict: 'not-met', reason: 'This price is for a membership that is no longer offered.', summary: 'Not a member.' })
          continue
        }
        // A signed-in person is told why and where to put it right: renew what lapsed, or join.
        const ended = account ? await lastLapsed(account, ref, day) : null
        const joinable = account && !ended ? await mayJoin(ref, scheme) : false
        out.push({
          account,
          ref: fullRef,
          verdict: 'not-met',
          reason: ended ? `Your membership ended on ${await longDate(ended)}.` : 'This price is for members.',
          ...(ended ? { remedy: { label: 'Renew', to: MINE } } : joinable ? { remedy: { label: 'Join', to: MINE } } : {}),
          summary: 'Not a member.',
        })
      }
    }
    return out
  },

  // The name to compare with the card shown, for staff only (V18): the list's name for an entry,
  // the holder's account name for a member number.
  async holder(evidence) {
    const entry = await first<{ name: string | null }>('SELECT holder_name AS name FROM membership_verification_entries WHERE id = ?', evidence)
    if (entry) return entry.name
    const row = await first<{ name: string | null }>(
      'SELECT a.name FROM membership_memberships m JOIN core_accounts a ON a.id = m.account_id WHERE m.id = ?',
      evidence,
    )
    return row?.name ?? null
  },
})
