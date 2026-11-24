// A person's account as staff see it: identity's own facts, addresses, how they sign in, their
// roles and standings. Opening it is audited. Emergency contacts and access needs are not here: each
// is read on its own route, with its own ability and audit, and this answer only says whether the
// viewer may ask (Identity Doc part 5, "Account").
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { all, can, defineRoute, first, nowMs, refuse } from '#kit'
import { accountById } from '../../../identity/accounts'
import { liveGrantsOf } from '../../../identity/grants'
import { standingOf } from '../../../identity/standings'
import { profileOf } from '../../../identity/access-scheme'
import { ageMarkerFor } from '../../../identity/age'

export default defineRoute({
  ability: 'core.account.read',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record, unit, actor }) => {
  const account = await accountById(record!.id)
  if (!account) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const id = account.id
  const [addresses, passkeys, sessions, grants] = await Promise.all([
    all<{ id: string, address: string, verified_at: number | null }>('SELECT id, address, verified_at FROM core_account_emails WHERE account_id = ? ORDER BY created_at', id), // exact-account: identity's own table, keyed by the living account
    all<{ id: string, label: string, created_at: number, last_used_at: number | null }>('SELECT id, label, created_at, last_used_at FROM core_passkeys WHERE account_id = ? ORDER BY created_at', id), // exact-account: identity's own table, keyed by the living account
    all<{ n: number }>('SELECT count(*) AS n FROM core_sessions WHERE account_id = ? AND ended_at IS NULL AND expires_at > ?', id, nowMs()), // exact-account: identity's own table, keyed by the living account
    liveGrantsOf(id),
  ])
  const providers = await all<{ provider: string }>('SELECT provider FROM core_federated_identities WHERE account_id = ?', id) // exact-account: identity's own table, keyed by the living account
  unit.audit({ action: 'read', record: ['core.account', id] })
  // What the viewer may do here, so the page offers only those (no component tests an ability).
  const may = async (ability: Parameters<typeof can>[1]) => (await can(actor, ability, ['core.account', id])).allowed
  const actions = {
    recover: await may('core.account.recover'),
    disable: await may('core.account.disable'),
    merge: await may('core.account.merge'),
    update: !account.anonymised_at && !account.merged_into_id && await may('core.account.update'),
    endSessions: await may('core.session.end'),
    grants: await may('core.grant.read'),
    emergencyContacts: false,
    accessNeeds: false,
    accessScheme: false,
    // Staff ask for their own erasure from their own account, like anybody else.
    erase: actor.accountId !== id && (await can(actor, 'core.data-request.manage')).allowed,
    // Recording the day someone under 18 turns 18 (C-74); only those who may record it see it here.
    age: !account.anonymised_at && !account.merged_into_id && await may('core.age.record'),
  }
  const standings = await standingOf(id)
  // Emergency contacts are offered only for a person with a standing (ID-17).
  actions.emergencyContacts = standings.length > 0 && await may('core.emergency-contact.read')
  // Nothing about the access scheme unless the viewer may see it (ID-39, ID-40): the scheme's
  // readers see where an application stands; the welfare lead sees needs the person shared with them.
  actions.accessScheme = await may('core.access-scheme.read')
  const profile = actions.accessScheme ? await profileOf(id) : null
  actions.accessNeeds = await may('core.access-profile.read')
    && !!(await first<{ n: number }>('SELECT 1 AS n FROM core_access_shares s JOIN core_access_profiles p ON p.account_id = s.account_id WHERE s.account_id = ? AND s.purpose = \'core.welfare\' AND p.status = \'accepted\'', id)) // exact-account: identity's own table, keyed by the living account
  return {
    id,
    name: account.name,
    pronouns: account.pronouns,
    origin: account.origin,
    createdAt: account.created_at,
    claimed: !!account.first_signed_in_at,
    lastSignedInAt: account.last_signed_in_at,
    disabled: account.disabled_at ? { at: account.disabled_at, reason: account.disabled_reason } : null,
    anonymised: !!account.anonymised_at,
    mergedInto: account.merged_into_id,
    addresses: addresses.map(a => ({ id: a.id, address: a.address, verified: !!a.verified_at, audience: a.id === account.audience_email_id, members: a.id === (account.members_email_id ?? account.audience_email_id) })),
    passkeys: passkeys.map(p => ({ id: p.id, label: p.label, addedAt: p.created_at, lastUsedAt: p.last_used_at })),
    providers: providers.map(p => p.provider),
    liveSessions: sessions[0]?.n ?? 0,
    grants: grants.map(g => ({ id: g.id, roleId: g.role_id, role: g.role_key, scope: g.scope, expiresAt: g.expires_at })),
    standings,
    ...(actions.age ? { age: await ageMarkerFor(id) } : {}),
    ...(actions.accessScheme ? { accessScheme: profile ? { status: profile.status, submittedAt: profile.submitted_at } : null } : {}),
    actions,
  }
})
