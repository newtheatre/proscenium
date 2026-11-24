// Edits a scheme. The address is fixed once the scheme has left draft, and the side once any
// membership exists (S2). Other changes apply to memberships written afterwards (S3).
import { getRouterParam } from 'nuxt/server'
import { defineRoute, nowMs, refuse } from '#kit'
import { slotDecides } from '#modules/forms'
import { getList } from '../../../lists'
import { charger } from '../../../charge'
import { convertCount } from '../../../dates'
import { APPLICATION_SLOT, checkLengthRule, hasMemberships, lengthOptions, requireScheme, schemeFields, verifierConfig } from '../../../schemes'

const COLUMN: Record<string, string> = {
  key: 'key', name: 'name', summary: 'summary', side: 'side', joinMode: 'join_mode', lengthRule: 'length_rule', fixedEndMonth: 'fixed_end_month',
  fixedEndDay: 'fixed_end_day', rolloverDays: 'rollover_days', renewalOpensDays: 'renewal_opens_days', graceDays: 'grace_days',
  reverifyOnRenewal: 'reverify_on_renewal', needsApproval: 'needs_approval', requiresPayment: 'requires_payment', voting: 'voting',
  acceptsReference: 'accepts_reference', holderMayEnd: 'holder_may_end', verifier: 'verifier',
}

// A fee can only be asked for while Membership fees is on to collect it.
function refuseFeesOff(): never {
  return refuse('membership.scheme.fees-off', 'A fee can only be collected while the Membership fees module is on.', { status: 409, remedy: 'Switch Membership fees on in Admin > Modules first.', fields: { requiresPayment: 'membership.scheme.fees-off' } })
}

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: schemeFields.partial(),
}, async (_event, { input, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (input.key !== undefined && input.key !== scheme.key && scheme.state !== 'draft')
    refuse('membership.scheme.key-fixed', 'The address cannot change once the scheme has been opened, because people may have it saved.', { status: 409, fields: { key: 'membership.scheme.key-fixed' } })
  if (input.side !== undefined && input.side !== scheme.side && await hasMemberships(scheme.id))
    refuse('membership.scheme.side-fixed', 'The side cannot change once anybody has held this scheme: it would give or take away the members\' area for all of them.', { status: 409, remedy: 'Close this scheme and open another on the other side.', fields: { side: 'membership.scheme.side-fixed' } })
  if (input.requiresPayment && !scheme.requiresPayment && !(await charger())) refuseFeesOff()
  // An open scheme that starts approving would turn everybody away until a form can approve them.
  if (input.needsApproval && !scheme.needsApproval && scheme.state !== 'draft' && !(await slotDecides(APPLICATION_SLOT, scheme.id)))
    refuse('membership.scheme.needs-application-form', 'Approval needs an application form whose workflow can approve or decline.', { status: 409, remedy: 'Attach the form under Application form first, then switch approval on.', fields: { needsApproval: 'membership.scheme.needs-application-form' } })
  const merged = { ...scheme, ...input }
  if (input.lengthRule !== undefined || input.fixedEndMonth !== undefined || input.fixedEndDay !== undefined) checkLengthRule(merged)
  // Lengths are a bare count in the rule's unit (months, or scheme years), so a change between the two
  // restates each one (12 months becomes 1 year) or is refused. An indefinite scheme has no unit to restate in.
  const converted: { id: string, count: number }[] = []
  if (input.lengthRule !== undefined && input.lengthRule !== scheme.lengthRule) {
    for (const option of (await lengthOptions([scheme.id])).get(scheme.id)!) {
      const count = convertCount(scheme.lengthRule, input.lengthRule, option.count)
      if (count === null)
        refuse('membership.scheme.lengths-fixed', `The length "${option.name}" cannot be restated for that rule, so the rule cannot change while this scheme has it.`, { status: 409, remedy: 'Lengths are counted in months from the day it starts and in years to a set day each year, and cannot be removed. Make a new scheme with the rule you want.', fields: { lengthRule: 'membership.scheme.lengths-fixed' } })
      converted.push({ id: option.id, count })
    }
  }
  // The verifier's configuration: the list it checks against, or the domains that pass.
  const verifier = input.verifier !== undefined ? input.verifier : scheme.verifier
  const config = input.listId !== undefined || input.verifier !== undefined || input.domains !== undefined
  let configJson: string | null = null
  if (config) {
    const before = verifierConfig(scheme)
    if (verifier === 'membership.list') {
      const listId = input.listId !== undefined ? input.listId : before.listId
      if (!(await getList(listId ?? undefined))) refuse('membership.scheme.list-needed', 'Choose the list this scheme checks against.', { status: 422, fields: { listId: 'membership.scheme.list-needed' } })
      configJson = JSON.stringify({ listId })
    }
    if (verifier === 'membership.email-domain') configJson = JSON.stringify({ domains: [...new Set(input.domains !== undefined ? input.domains ?? [] : before.domains ?? [])] })
  }
  const changed = Object.keys(input).filter(k => k !== 'listId' && k !== 'domains' && (input as Record<string, unknown>)[k] !== undefined)
  if (!changed.length && !config) return { schemeId: scheme.id }
  const value = (k: string) => {
    const v = (merged as Record<string, unknown>)[k]
    return typeof v === 'boolean' ? (v ? 1 : 0) : v ?? null
  }
  unit.add({
    sql: `UPDATE OR IGNORE membership_schemes SET ${[...changed.map(k => `${COLUMN[k]} = ?`), ...(config ? ['verifier_config = ?'] : [])].join(', ')}, updated_at = ? WHERE id = ? AND state = ?`,
    params: [...changed.map(value), ...(config ? [configJson] : []), nowMs(), scheme.id, scheme.state],
  }).expect(1, { code: 'membership.scheme.changed', reason: 'The scheme was changed by somebody else, or its address is taken.', remedy: 'Reload it and try again.' })
  for (const option of converted) unit.add({ sql: 'UPDATE membership_length_options SET count = ? WHERE id = ? AND scheme_id = ?', params: [option.count, option.id, scheme.id] })
  unit.audit({ action: 'update', record: ['membership.scheme', scheme.id], detail: { fields: config ? [...changed, 'verifier_config'] : changed } })
  return { schemeId: scheme.id }
})
