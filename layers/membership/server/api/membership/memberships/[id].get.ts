// One membership for its console page (tab 5, "A membership"): the person, the scheme, the dates,
// the derived status, how it started and ended, every check made on it, the application form's
// response it was applied for with, and whether the reader may change its dates.
import { getRouterParam } from 'h3'
import { all, can, defineRoute, first, isEnabled, refuse } from '#kit'
import { accountLabel } from '#modules/core'
import { derivedStatus } from '../../../dates'
import { memberNumber, todayOrNull } from '../../../memberships'

export default defineRoute({
  ability: 'membership.membership.view',
  record: event => ['membership.membership', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record }) => {
  const m = await first<{ id: string, accountId: string, schemeId: string, schemeName: string, side: string, graceDays: number, holderMayEnd: number, lengthRule: string, state: string, origin: string, lengthName: string | null, startsOn: string | null, endsOn: string | null, activatedAt: number | null, endedAt: number | null, endReason: string | null, note: string | null, createdAt: number, responseId: string | null, awaitingApproval: number }>(
    `SELECT m.id, m.account_id AS accountId, m.scheme_id AS schemeId, s.name AS schemeName, s.side, s.grace_days AS graceDays, s.holder_may_end AS holderMayEnd, s.length_rule AS lengthRule,
            m.state, m.origin, o.name AS lengthName, m.starts_on AS startsOn, m.ends_on AS endsOn, m.activated_at AS activatedAt, m.ended_at AS endedAt,
            m.end_reason AS endReason, m.note, m.created_at AS createdAt, m.response_id AS responseId,
            (m.state = 'pending' AND m.needs_approval = 1 AND m.approved_at IS NULL) AS awaitingApproval
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id LEFT JOIN membership_length_options o ON o.id = m.length_option_id
      WHERE m.id = ?`,
    record!.id,
  )
  if (!m) refuse('core.not-found', 'There is no such membership.', { status: 404 })
  const day = await todayOrNull()
  // The list a check used, the name it gives for the entry and the ID as typed, for staff comparing them with the person and their card (V18).
  const checks = await all<{ verifier: string, outcome: string, reason: string | null, note: string | null, decidedBy: string | null, createdAt: number, listName: string | null, listedAs: string | null, reference: string | null, noun: string | null }>(
    `SELECT v.verifier, v.outcome, v.reason, v.note, v.decided_by AS decidedBy, v.created_at AS createdAt, l.name AS listName, e.holder_name AS listedAs, v.reference, l.reference_noun AS noun
       FROM membership_verifications v
       LEFT JOIN membership_verification_entries e ON e.id = v.entry_id
       LEFT JOIN membership_verification_lists l ON l.id = e.list_id
      WHERE v.membership_id = ? ORDER BY v.created_at, v.id`,
    m!.id,
  )
  const status = m!.state !== 'active' ? m!.state : day ? derivedStatus({ startsOn: m!.startsOn!, endsOn: m!.endsOn }, m!.graceDays, day) : 'upcoming'
  return {
    membership: { ...m, holderMayEnd: !!m!.holderMayEnd, awaitingApproval: !!m!.awaitingApproval, status, name: await accountLabel(m!.accountId) },
    feesOn: await isEnabled('membership-fees'),
    number: (await memberNumber(m!.accountId))?.label ?? null,
    canChangeDates: m!.state === 'active' && (await can(actor, 'membership.membership.update')).allowed,
    // MEM-34: the details kept about members, for those who may fill them in.
    canEditFields: (await can(actor, 'membership.membership.fields', ['membership.membership', m!.id])).allowed,
    checks: await Promise.all(checks.map(async c => ({ ...c, decidedBy: c.decidedBy ? await accountLabel(c.decidedBy) : null }))),
  }
})
