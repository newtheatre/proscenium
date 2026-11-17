// Creates a scheme as a draft (MEM-01). Renewal window, grace and whether holders may end their own
// membership start from the settings when they are not given.
import { defineRoute, newId, nowMs } from '#kit'
import { checkLengthRule, schemeDefaults, schemeFields } from '../../../schemes'

const input = schemeFields.omit({ verifier: true, listId: true, domains: true }).partial({ summary: true, joinMode: true, fixedEndMonth: true, fixedEndDay: true, rolloverDays: true, renewalOpensDays: true, graceDays: true, reverifyOnRenewal: true, needsApproval: true, requiresPayment: true, voting: true, acceptsReference: true, holderMayEnd: true })

export default defineRoute({ ability: 'membership.scheme.manage', rateLimit: 'write', idempotent: true, input }, async (_event, { input, unit }) => {
  const fields = { ...(await schemeDefaults()), summary: null, joinMode: 'apply' as const, fixedEndMonth: null, fixedEndDay: null, rolloverDays: 0, reverifyOnRenewal: true, needsApproval: false, requiresPayment: false, voting: false, acceptsReference: false, ...input }
  checkLengthRule(fields)
  const id = newId('msch')
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO membership_schemes (id, key, name, summary, side, state, join_mode, length_rule, fixed_end_month, fixed_end_day, rollover_days,
            renewal_opens_days, grace_days, reverify_on_renewal, needs_approval, requires_payment, voting, accepts_reference, holder_may_end, position, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(position), 0) + 1 FROM membership_schemes), ?, ?)`,
    params: [id, fields.key, fields.name, fields.summary, fields.side, fields.joinMode, fields.lengthRule, fields.fixedEndMonth, fields.fixedEndDay, fields.rolloverDays,
      fields.renewalOpensDays, fields.graceDays, fields.reverifyOnRenewal ? 1 : 0, fields.needsApproval ? 1 : 0, fields.requiresPayment ? 1 : 0, fields.voting ? 1 : 0,
      fields.acceptsReference ? 1 : 0, fields.holderMayEnd ? 1 : 0, at, at],
  }).expect(1, { code: 'membership.scheme.key-taken', reason: `Another scheme already uses the address ${fields.key}.` })
  unit.audit({ action: 'create', record: ['membership.scheme', id] })
  return { schemeId: id }
})
