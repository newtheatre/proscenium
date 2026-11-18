// The caller's own memberships for My membership (MEM-33): each with its scheme, dates and derived
// status, their member number, and their open applications with what each is waiting on and, for a
// fee, how much. Ended,
// declined and expired rows are left to a later slice. Each membership whose renewal window is open
// carries what renewing it asks for (its lengths and fees, and the reference where the check runs
// again), from the scheme itself: a closed scheme is renewed but is not among the open schemes.
import { all, defineRoute, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { derivedStatus } from '../../dates'
import { memberNumber, todayOrNull } from '../../memberships'
import { renewalWindow } from '../../renewal'
import { charger } from '../../charge'
import { listSetsEnd, schemeList } from '../../lists'
import { getScheme, lengthOptions } from '../../schemes'

interface Fee { amountMinor: number, currency: string }
interface RenewAsks { options: { id: string, name: string, fee: Fee | null }[], fee: Fee | null, asksFor: string | null, endsByList: boolean, online: boolean }

const RANK = { 'current': 0, 'in-grace': 0, 'upcoming': 1, 'lapsed': 2 } as const

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const accountId = actor.accountId!
  const day = await todayOrNull()
  const rows = await all<{ id: string, scheme_id: string, scheme_name: string, side: 'members' | 'audience', starts_on: string, ends_on: string | null, grace_days: number, option_name: string | null, holder_may_end: number, renewal_opens_days: number, state: string, renewed: number }>(
    `SELECT m.id, m.scheme_id, s.name AS scheme_name, s.side, m.starts_on, m.ends_on, s.grace_days, o.name AS option_name, s.holder_may_end, s.renewal_opens_days, s.state,
            EXISTS (SELECT 1 FROM membership_memberships r WHERE r.renews_id = m.id AND r.state IN ('pending', 'active')) AS renewed
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
       LEFT JOIN membership_length_options o ON o.id = m.length_option_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'active'
      ORDER BY m.starts_on DESC, m.id`,
    accountId,
  )
  const pending = await all<{ id: string, schemeId: string, schemeName: string, appliedAt: number, expiresAt: number | null, waitingOnStaff: number, reason: string | null }>(
    `SELECT m.id, m.scheme_id AS schemeId, s.name AS schemeName, m.created_at AS appliedAt, m.expires_at AS expiresAt, (m.needs_verification = 1 AND m.verified_at IS NULL) AS waitingOnStaff,
            (SELECT v.reason FROM membership_verifications v WHERE v.membership_id = m.id ORDER BY v.created_at DESC, v.id DESC LIMIT 1) AS reason
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'pending' ORDER BY m.created_at`,
    accountId,
  )
  const fees = await charger()
  const quote = async (schemeId: string, optionId: string | null) => {
    const q = fees && day ? await fees.priceFor(schemeId, optionId, 'renew', day) : null
    return q ? { amountMinor: q.amountMinor, currency: q.currency } : null
  }
  // What renewing asks for, once per scheme.
  const asks = new Map<string, RenewAsks | null>()
  async function renewAsks(schemeId: string): Promise<RenewAsks | null> {
    if (asks.has(schemeId)) return asks.get(schemeId)!
    const scheme = await getScheme(schemeId)
    let out: RenewAsks | null = null
    if (scheme) {
      const list = scheme.reverifyOnRenewal ? await schemeList(scheme) : null
      const endsByList = await listSetsEnd(list)
      const options = (await lengthOptions([scheme.id], true)).get(scheme.id)!
      out = {
        options: await Promise.all(options.map(async o => ({ id: o.id, name: o.name, fee: scheme.requiresPayment ? await quote(scheme.id, o.id) : null }))),
        fee: scheme.requiresPayment && (endsByList || scheme.lengthRule === 'indefinite') ? await quote(scheme.id, null) : null,
        asksFor: list?.keyKind === 'reference' ? list.referenceLabel : null,
        endsByList,
        online: !scheme.requiresPayment || !!fees,
      }
    }
    asks.set(schemeId, out)
    return out
  }
  const memberships = await Promise.all(rows.map(async (r) => {
    // R1: when it may be renewed, and whether it is open now. R6: an archived scheme is not renewed.
    const window = r.state === 'archived' || r.renewed ? null : renewalWindow(r.ends_on, { renewalOpensDays: r.renewal_opens_days, graceDays: r.grace_days })
    const open = !!window && !!day && day >= window.opensOn && day <= window.closesOn
    return {
      id: r.id, schemeId: r.scheme_id, schemeName: r.scheme_name, side: r.side, length: r.option_name, startsOn: r.starts_on, endsOn: r.ends_on, mayEnd: !!r.holder_may_end,
      renewal: window && day ? { ...window, open, ...(open ? { asks: await renewAsks(r.scheme_id) } : {}) } : null,
      renewed: !!r.renewed,
      status: day ? derivedStatus({ startsOn: r.starts_on, endsOn: r.ends_on }, r.grace_days, day) : 'upcoming' as const,
    }
  }))
  // The one held now first, then the one that follows it, then any that have lapsed.
  memberships.sort((a, b) => RANK[a.status] - RANK[b.status])
  return {
    number: await memberNumber(accountId),
    // Whether My membership offers the card (membership.card.show); the code itself comes from Box office.
    card: await useSetting('membership.card.show') !== false,
    // An open application waits on staff's check, or on its fee (A2: never both at once for the person).
    applications: await Promise.all(pending.map(async ({ waitingOnStaff, ...p }) => {
      const charge = await fees?.status(p.id) ?? null
      return { ...p, waiting: waitingOnStaff || !charge || charge.state !== 'open' ? 'staff' as const : 'payment' as const, charge }
    })),
    memberships,
  }
})
