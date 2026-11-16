// Identity's part of the core manifest (Identity and accounts specification, part 6): its settings,
// rules, abilities, record types, events, background work, secrets and health checks. Phase 1
// declares what the first stories use; the rest arrives with the stories that need it.
import { z } from 'zod'
import { ability, defineAbilities, defineRecords, defineSettings, event, job, point, record, secret, setting, task, useContext, type SettingRule } from '#kit'

const change = 'core.identity-settings.manage'

export const identitySettings = defineSettings('core', {
  'sign-in.email-link': setting.boolean({ default: true, change, audience: 'public' }),
  'sign-in.link-lifetime': setting.duration({ default: '15m', min: '5m', max: '1h', change, audience: 'public', quotable: true }),
  'sign-in.code-attempts': setting.integer({ default: 5, min: 3, max: 10, unit: 'core.units.attempts', change }),
  'sign-in.open-sign-up': setting.boolean({ default: true, change, audience: 'public' }),
  'sign-in.google': setting.boolean({ default: false, change, audience: 'public' }),
  // Not in the specification's list: Google needs a client id as well as the secret, and an id is
  // not a secret, so it is a setting the theatre types in beside the switch.
  'sign-in.google-client-id': setting.text({ unset: true, maxLength: 200, change }),
  'sign-in.google-domains': setting.list({ default: [], of: 'text', maxLength: 253, change }),
  'sign-in.managed-domains': setting.list({ default: [], of: 'text', maxLength: 253, change, audience: 'public' }),
  'sign-in.provider-is-strong': setting.boolean({ default: false, change }),

  'sessions.lifetime': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
  'sessions.idle-limit': setting.duration({ default: '14d', min: '1h', max: '90d', change }),

  'recovery.code-count': setting.integer({ default: 10, min: 6, max: 20, unit: 'core.units.codes', change }),

  'grants.default-expiry': setting.choice({ default: 'none', options: ['year-end', 'none'], change }),
  'grants.allow-no-expiry': setting.boolean({ default: true, change }),

  'members-area.enabled': setting.boolean({ default: true, change, audience: 'public' }),
  'members-area.name': setting.text({ default: 'Members\' area', maxLength: 40, change, audience: 'public', quotable: true }),

  'merge.undo-window': setting.duration({ default: '30d', min: '0d', max: '90d', change }),

  'privacy.cooling-off': setting.duration({ default: '7d', min: '0d', max: '30d', change, audience: 'public', quotable: true }),
  'privacy.respond-within': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
  // Erasure and the download are not offered until the theatre says who to contact about personal data.
  'privacy.contact': setting.text({ unset: true, maxLength: 120, change, audience: 'public', quotable: true }),
})

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

export const identitySettingRules: SettingRule[] = [
  { id: 'idle-within-lifetime', check: s => s['sessions.idle-limit'] <= s['sessions.lifetime'] },
  { id: 'managed-domains-need-provider', check: s => !s['sign-in.managed-domains'].length || s['sign-in.google'] },
  { id: 'strong-provider-needs-managed-domain', check: s => !s['sign-in.provider-is-strong'] || s['sign-in.managed-domains'].length > 0 },
  { id: 'google-needs-client-id', check: s => !s['sign-in.google'] || !!s['sign-in.google-client-id'] },
  // Rules run while a setting is saved, inside the request, so the Worker secret can be read here.
  { id: 'google-needs-client-secret', check: s => !s['sign-in.google'] || !!useContext().env.CORE_GOOGLE_CLIENT_SECRET },
  { id: 'domains-are-domains', check: s => [...s['sign-in.google-domains'], ...s['sign-in.managed-domains']].every((d: string) => DOMAIN.test(d)) },
]

export const identityRecords = defineRecords('core', {
  'account': record({ table: 'core_accounts', owner: 'id' }),
  'role': record({ table: 'core_roles' }),
  'grant': record({ table: 'core_grants', owner: 'account_id' }),
  'data-request': record({ table: 'core_data_requests', owner: 'account_id' }),
})

export const identityAbilities = defineAbilities('core', {
  'account.search': ability({ risk: 'normal', grantAt: ['site'] }),
  'account.read': ability({ on: 'core.account', risk: 'privileged', fresh: false, audit: 'read', owner: 'grants', implies: ['account.search'], grantAt: ['site'] }),
  'account.disable': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'account.merge': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'data-request.manage': ability({ on: 'core.data-request', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'session.end': ability({ on: 'core.account', risk: 'privileged', owner: 'grants', grantAt: ['site'] }),
  'role.read': ability({ risk: 'normal', audit: false, grantAt: ['site'] }),
  'role.manage': ability({ risk: 'privileged', implies: ['role.read'], grantAt: ['site'] }),
  'grant.read': ability({ risk: 'normal', implies: ['account.search'], audit: false, grantAt: ['site'] }),
  'grant.manage': ability({ on: 'core.grant', risk: 'privileged', owner: 'refuses', implies: ['grant.read'], grantAt: ['site', 'module', 'record'] }),
  'identity-settings.manage': ability({ risk: 'privileged', grantAt: ['site'] }),
})

const account = z.object({ accountId: z.string() })

export const identityEvents = {
  'core.account.created': event({ version: 1, payload: z.object({ accountId: z.string(), origin: z.enum(['setup', 'self', 'guest', 'named-by-other', 'invite', 'staff']) }), internal: true }),
  'core.account.claimed': event({ version: 1, payload: account, internal: true }),
  'core.account.disabled': event({ version: 1, payload: account, internal: true }),
  'core.account.enabled': event({ version: 1, payload: account, internal: true }),
  'core.account.erased': event({ version: 1, payload: account, internal: true }),
  'core.data-request.finished': event({ version: 1, payload: z.object({ requestId: z.string(), kind: z.enum(['export', 'erasure']) }), internal: true }),
  'core.account.merged': event({ version: 1, payload: z.object({ survivorId: z.string(), mergedAccountId: z.string(), mergeId: z.string() }), internal: true }),
  'core.account-email.verified': event({ version: 1, payload: z.object({ accountId: z.string(), emailId: z.string() }), internal: true }),
  'core.grant.created': event({ version: 1, payload: z.object({ grantId: z.string(), accountId: z.string(), roleId: z.string() }), internal: true }),
  'core.grant.ended': event({ version: 1, payload: z.object({ grantId: z.string(), accountId: z.string(), roleId: z.string(), reason: z.enum(['revoked', 'replaced', 'role_archived', 'account_closed', 'merged', 'given_up']) }), internal: true }),
  'core.role.changed': event({ version: 1, payload: z.object({ roleId: z.string() }), internal: true }),
}

export const identityJobs = {
  // The link and code travel sealed with a key derived from CORE_SESSION_KEY, never in clear.
  'core.send-sign-in-link': job({ payload: z.object({ tokenId: z.string(), sealed: z.string() }), lane: 'prompt' }),
  // The erasure batch for one request (ID-16). Safe to repeat: a second run writes nothing.
  'core.run-erasure': job({ payload: z.object({ requestId: z.string() }), lane: 'prompt' }),
}

/** Points identity offers other modules (spec part 5). */
export const identityPoints = {
  // Given an account, the hold codes that pause its erasure. Each code has a sentence for staff and
  // one for the person in the module's catalogue, at "<code>.staff" and "<code>.person".
  'core.erasure-hold': point({ kind: 'code', contract: 'erasure-hold' }),
}

export const identityTasks = {
  'core.sweep-identity': task({ every: '1h' }),
  // Runs confirmed erasures whose cooling-off is over, and re-checks held ones (ID-16, ID-35).
  // Hourly rather than the specification's daily, so an erasure runs within the hour it falls due.
  'core.review-data-requests': task({ every: '1h' }),
}

export const identitySecrets = {
  CORE_SESSION_KEY: secret({ needed: 'always' }),
  CORE_GOOGLE_CLIENT_SECRET: secret({ needed: 'when-used' }),
  CORE_OWNER_RECOVERY: secret({ needed: 'optional' }),
}

export const identityContributions = {
  // The other twelve identity messages (spec part 4) arrive with the stories that send them.
  'core.notification-type': [{
    id: 'core.sign-in-link',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { link: 'url' as const, code: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Sign in to {{ theatre }}',
        body: 'Use this link to sign in. It works once, in the browser where you asked for it.\n\n[Sign in]({{ link }})\n\nOr type this code on any device: **{{ code }}**\n\nIf you did not ask to sign in, you can ignore this email.',
      },
    },
  }, {
    // The link confirms an erasure request (ID-16). It is sealed: kept encrypted, cleared once sent.
    id: 'core.erasure-confirm',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { link: 'sealed' as const, wait: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Confirm that {{ theatre }} should erase your account',
        body: 'You asked {{ theatre }} to erase your account. Nothing happens until you confirm.\n\n[Confirm erasure]({{ link }})\n\nOnce confirmed, it runs after {{ wait }}. Until then you can cancel it from your account. Tickets and sales stay on the theatre\'s records with your name taken off.\n\nIf you did not ask for this, you can ignore this email and nothing will change.',
      },
    },
  }, {
    // Sent once, to the address the account had, after the erasure batch commits.
    id: 'core.erasure-done',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: {},
    wording: {
      'en-GB': {
        subject: 'Your account at {{ theatre }} has been erased',
        body: 'Your account at {{ theatre }} has been erased. Your name, addresses and sign-in methods are gone, and this address can be used for a new account.\n\nThis is the last email we will send you about this account.',
      },
    },
  }],
  // The last usable Owner cannot be erased until another Owner exists (part 3, "Export and erasure").
  'core.erasure-hold': [{ id: 'core.last-owner', file: 'last-owner' }],
  'core.health-check': [
    { id: 'core.session-key', file: 'session-key' },
    { id: 'core.sign-in-challenge', file: 'sign-in-challenge' },
    { id: 'core.owner-recovery', file: 'owner-recovery' },
  ],
}
