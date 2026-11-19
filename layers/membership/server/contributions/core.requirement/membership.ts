// Membership's source on core.requirement (tab 4, "The requirement source"; MEM-35, MEM-58): the
// member price. References are `membership:<scheme id>` and `membership:any`. A host such as Box
// office stores them on a ticket type and never learns what they mean.
//
// It answers by account, and, where the scheme accepts a reference (V8 to V11), by a reference
// presented in place of signing in: an entry on the scheme's list (a student ID) or a member number.
// Evidence is the list entry's id where one exists, otherwise the membership's id (V11).
import { all, createUnit, defineRequirementSource, first, localDate, refuse, useContext, useSetting, type SourceAnswer } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findEntry, getList, normalise, nounOf, schemeList, wellFormed, type ListRow } from '../../lists'
import { getScheme, listSchemes, type Scheme } from '../../schemes'
import { joinScheme } from '../../join'
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

// A request for staff to check a reference the list did not hold (or held under another name) gives
// the price while it waits, as a pending access application does: evidence `pending:<membership id>`,
// judged afresh at the door, so a request still waiting or declined shows there as not met.
const PENDING = 'pending:'
const WAITING_SUMMARY = 'Membership check not decided yet. Ask to see their card.'

// Evidence for a price given while checks were switched off: met at the door even once they are back on.
const UNCHECKED = 'unchecked:'
const UNCHECKED_SUMMARY = 'Sold while membership checks were switched off. Ask to see their card.'

/** The latest request of this account waiting for staff to check its reference, for a reference. */
async function waitingBy(accountId: string, ref: string): Promise<string | null> {
  const row = await first<{ id: string }>(
    `SELECT m.id FROM membership_memberships m WHERE m.state = 'pending' AND m.needs_verification = 1 AND m.verified_at IS NULL
      AND m.account_id IN (${accountScopeSql('?1')}) ${ref === ANY ? '' : 'AND m.scheme_id = ?2'}
      AND EXISTS (SELECT 1 FROM membership_verifications v WHERE v.membership_id = m.id AND v.outcome = 'needs-staff' AND v.reason IN ('not-on-list', 'name-differs'))
      ORDER BY m.created_at DESC LIMIT 1`,
    accountId, ...(ref === ANY ? [] : [ref]),
  )
  return row?.id ?? null
}

/** Pending evidence judged again: met once staff have passed it and it is current, otherwise not met. */
async function pendingAnswer(ref: string, membershipId: string, day: string): Promise<Omit<SourceAnswer, 'account' | 'ref'>> {
  const m = (await all<Held>(`${HELD} WHERE ${CURRENT_ON} AND m.id = ?2`, day, membershipId))[0]
  if (m && matches(ref, m)) return { ...metFor({ ...m, accountId: await survivor(m.accountId) }, true), evidence: `${PENDING}${membershipId}` }
  const row = await first<{ state: string }>('SELECT state FROM membership_memberships WHERE id = ?', membershipId)
  return row?.state === 'pending'
    ? { verdict: 'not-met', summary: WAITING_SUMMARY }
    : { verdict: 'not-met', summary: 'Membership check not passed.' }
}

/** Whether a well-formed reference the list did not hold may be sent to staff to check: an open scheme people apply to. */
async function askableFor(lists: { list: ListRow, schemeId: string }[], typed: string): Promise<boolean> {
  for (const { list, schemeId } of lists) {
    if (!wellFormed(list.referenceShape, typed)) continue
    const s = await getScheme(schemeId)
    if (s?.state === 'open' && s.joinMode === 'apply') return true
  }
  return false
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
    const out: Record<string, { label: string, presentable?: { label: string, field?: string, noun?: string, shape: string }, open?: true }> = {}
    // A price is open to everyone when visitors can see the schemes and join one themselves.
    const listed = !!(await useSetting('membership.join.public-listing'))
    const openTo = async (id: string, scheme: Scheme | null) => listed && await mayJoin(id, scheme) ? { open: true as const } : {}
    const presentableOf = async (scheme: Scheme) => {
      const list = await schemeList(scheme)
      // The list's label is a whole phrase (V13), so it is the field's own name and never set inside a
      // sentence; the hint uses the list's short noun, and says a member number works too, since a
      // member added by staff may have no reference on the list.
      return list?.keyKind === 'reference'
        ? { label: `${scheme.name}: type your ${nounOf(list)} or member number to get this price`, field: list.referenceLabel ?? 'Membership reference', noun: nounOf(list), shape: list.referenceShape ? `${list.referenceShape.kind}:${list.referenceShape.min}-${list.referenceShape.max}` : 'reference' }
        : { label: `${scheme.name}: type your member number to get this price`, field: 'Member number', noun: 'member number', shape: 'member-number' }
    }
    for (const ref of refs) {
      const id = schemeIdOf(ref)
      if (id === ANY) {
        // Any membership: a reference is taken where some scheme takes one. With one such scheme its
        // own words (V13); with several, words that fit them all.
        const taking = (await listSchemes(['open', 'closed'])).filter(s => s.acceptsReference)
        out[ref] = {
          ...(taking.length === 1
            ? { label: 'Members', presentable: await presentableOf(taking[0]!) }
            : taking.length ? { label: 'Members', presentable: { label: 'Members: type your membership reference or member number to get this price', field: 'Membership reference', noun: 'membership reference', shape: 'reference' } } : { label: 'Members' }),
          ...await openTo(ANY, null),
        }
        continue
      }
      const scheme = await getScheme(id)
      if (!scheme || scheme.state === 'archived') {
        out[ref] = { label: NO_LONGER }
        continue
      }
      // V13: the list's own question, never a bare noun; for member numbers, built from the scheme's name.
      out[ref] = { ...(scheme.acceptsReference ? { label: scheme.name, presentable: await presentableOf(scheme) } : { label: scheme.name }), ...await openTo(id, scheme) }
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
    const checking = (await useSetting('membership.verification.member-prices')) !== false

    for (const fullRef of refs) {
      const ref = schemeIdOf(fullRef)
      const scheme = ref === ANY ? null : await schemeOf(ref)
      const offered = presented?.find(p => p.ref === fullRef)

      for (const account of accountIds) {
        if (offered && 'evidence' in offered && offered.evidence.startsWith(UNCHECKED)) {
          out.push({ account, ref: fullRef, verdict: 'met', evidence: offered.evidence, summary: UNCHECKED_SUMMARY })
          continue
        }
        // Checks off: anyone signed in, or anyone typing a reference, gets the price unchecked.
        if (!checking && (account || (offered && 'value' in offered && normalise('reference', offered.value)))) {
          const typed = offered && 'value' in offered ? normalise('reference', offered.value) : ''
          out.push({ account, ref: fullRef, verdict: 'met', evidence: `${UNCHECKED}${typed || 'account'}`, summary: UNCHECKED_SUMMARY })
          continue
        }
        // The account is judged first: a signed-in holder is never asked for their own reference.
        if (account) {
          const held = (await heldBy(account, day)).filter(m => matches(ref, m))
          if (held.length) {
            out.push({ account, ref: fullRef, ...metFor(held[0]!, false) })
            continue
          }
          const waiting = await waitingBy(account, ref)
          if (waiting) {
            out.push({ account, ref: fullRef, verdict: 'met', evidence: `${PENDING}${waiting}`, summary: WAITING_SUMMARY })
            continue
          }
        }
        if (offered && (ref === ANY || scheme?.acceptsReference)) {
          let m: Held | undefined
          const lists = await listsFor(ref, scheme)
          if ('evidence' in offered && offered.evidence.startsWith(PENDING)) {
            out.push({ account, ref: fullRef, ...(await pendingAnswer(ref, offered.evidence.slice(PENDING.length), day)) })
            continue
          }
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
              const reason = sample ? shapeText(nounOf(sample), sample.referenceShape) : 'That is not a member number. It is the number on your membership card, such as M-412.'
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
              ? `We could not find a current membership with that ${nounOf(list)}. Have a membership? Contact us.`
              : shapeText(nounOf(list), list.referenceShape)
          const ask = typedValue !== null && await askableFor(lists, typedValue)
          out.push({ account, ref: fullRef, verdict: 'not-met', reason, help, summary: 'No current membership found for the reference given.', ...(ask ? { ask } : {}) })
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

  // A request for staff to check a reference not found, made while booking: the scheme's own join
  // with askStaff, so it waits in the applications queue. A scheme asking more goes to its join page.
  async ask(_accountId, fullRef, value) {
    const ref = schemeIdOf(fullRef)
    const typed = normalise('reference', value)
    const lists = await listsFor(ref, ref === ANY ? null : await getScheme(ref))
    let scheme: Scheme | null = null
    for (const { list, schemeId } of lists) {
      if (!wellFormed(list.referenceShape, typed)) continue
      const s = await getScheme(schemeId)
      if (s?.state === 'open' && s.joinMode === 'apply') {
        scheme = s
        break
      }
    }
    if (!scheme) refuse('membership.ask.not-taken', 'The theatre cannot check that by hand online.', { status: 409, remedy: 'Contact the theatre.' })
    const toJoinPage = () => refuse('membership.ask.join-page', 'This membership needs a little more from you than your ID.', { status: 409, remedy: 'Finish your request on the membership page.', detail: { to: `/join/${scheme!.key}` } })
    if (scheme!.requiresPayment || scheme!.needsApproval) toJoinPage()
    const unit = createUnit()
    let joined: { pending: boolean }
    try {
      joined = await joinScheme(unit.view(), useContext().actor, scheme!, { reference: value, askStaff: true })
    }
    catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'membership.join.form-needed' || code === 'membership.option.choose') toJoinPage()
      throw error
    }
    await unit.commit()
    return { state: joined!.pending ? 'requested' : 'met' }
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
