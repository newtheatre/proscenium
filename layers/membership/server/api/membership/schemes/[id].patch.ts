// Edits a scheme. The address is fixed once the scheme has left draft, and the side once any
// membership exists (S2). Other changes apply to memberships written afterwards (S3).
import { getRouterParam } from 'h3'
import { defineRoute, nowMs, refuse } from '#kit'
import { getList } from '../../../lists'
import { checkLengthRule, hasMemberships, requireScheme, schemeFields, verifierConfig } from '../../../schemes'

const COLUMN: Record<string, string> = {
  key: 'key', name: 'name', summary: 'summary', side: 'side', joinMode: 'join_mode', lengthRule: 'length_rule', fixedEndMonth: 'fixed_end_month',
  fixedEndDay: 'fixed_end_day', rolloverDays: 'rollover_days', renewalOpensDays: 'renewal_opens_days', graceDays: 'grace_days',
  reverifyOnRenewal: 'reverify_on_renewal', needsApproval: 'needs_approval', requiresPayment: 'requires_payment', voting: 'voting',
  acceptsReference: 'accepts_reference', holderMayEnd: 'holder_may_end', verifier: 'verifier',
}

export default defineRoute({
  ability: 'membership.scheme.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: schemeFields.partial(),
}, async (_event, { input, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (input.key !== undefined && input.key !== scheme.key && scheme.state !== 'draft')
    refuse('membership.scheme.key-fixed', 'The address cannot change once the scheme has been opened, because people may have it saved.', { status: 409, fields: { key: 'membership.scheme.key-fixed' } })
  if (input.side !== undefined && input.side !== scheme.side && await hasMemberships(scheme.id))
    refuse('membership.scheme.side-fixed', 'The side cannot change once anybody has held this scheme: it would give or take away the members\' area for all of them.', { status: 409, remedy: 'Close this scheme and open another on the other side.', fields: { side: 'membership.scheme.side-fixed' } })
  const merged = { ...scheme, ...input }
  if (input.lengthRule !== undefined || input.fixedEndMonth !== undefined || input.fixedEndDay !== undefined) checkLengthRule(merged)
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
  unit.audit({ action: 'update', record: ['membership.scheme', scheme.id], detail: { fields: config ? [...changed, 'verifier_config'] : changed } })
  return { schemeId: scheme.id }
})
