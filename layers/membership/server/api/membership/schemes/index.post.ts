// Creates a scheme as a draft (MEM-01) from its name alone: a members' scheme running from the day
// it starts, its address made from the name. Whatever else is given is kept; the rest is settings.
import { all, defineRoute, newId, nowMs, refuse } from '#kit'
import { charger } from '../../../charge'
import { checkLengthRule, schemeDefaults, schemeFields } from '../../../schemes'

const input = schemeFields.omit({ verifier: true, listId: true, domains: true }).partial({ summary: true, joinMode: true, fixedEndMonth: true, fixedEndDay: true, rolloverDays: true, key: true, side: true, lengthRule: true, renewalOpensDays: true, graceDays: true, reverifyOnRenewal: true, needsApproval: true, requiresPayment: true, voting: true, acceptsReference: true, holderMayEnd: true })

export default defineRoute({ ability: 'membership.scheme.manage', rateLimit: 'write', idempotent: true, input }, async (_event, { input, unit }) => {
  const key = input.key ?? await freeKey(input.name)
  const fields = { ...(await schemeDefaults()), side: 'members' as const, lengthRule: 'rolling' as const, summary: null, joinMode: 'apply' as const, fixedEndMonth: null, fixedEndDay: null, rolloverDays: 0, reverifyOnRenewal: true, needsApproval: false, requiresPayment: false, voting: false, acceptsReference: false, ...input, key }
  checkLengthRule(fields)
  if (fields.requiresPayment && !(await charger()))
    refuse('membership.scheme.fees-off', 'A fee can only be collected while the Membership fees module is on.', { status: 409, remedy: 'Switch Membership fees on in Admin > Modules first.', fields: { requiresPayment: 'membership.scheme.fees-off' } })
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

/** An address made from the name, with a number after it when another scheme already has that one. */
async function freeKey(name: string): Promise<string> {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).replace(/-$/, '') || 'scheme' // not-policy: room for a number within the address's bound
  const taken = new Set((await all<{ key: string }>('SELECT key FROM membership_schemes WHERE key = ? OR key LIKE ?', base, `${base}-%`)).map(r => r.key))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}
