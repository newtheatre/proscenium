// Identity's part of the core manifest (Identity and accounts specification, part 6): its settings,
// rules, abilities, record types, events, background work, secrets and health checks. Phase 1
// declares what the first stories use; the rest arrives with the stories that need it.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineRecords, defineSettings, event, factDecl, job, point, record, secret, setting, task, useContext, type SettingRule } from '#kit'

const change = 'core.identity-settings.manage'
// How people sign in, how long sessions last and recovery are set once for the installation, so they
// sit in Site administration (Sign-in at /admin/sign-in), not on the console's settings page.

export const identitySettings = defineSettings('core', {
  'sign-in.email-link': setting.boolean({ default: true, change, audience: 'public' }),
  'sign-in.link-lifetime': setting.duration({ default: '15m', min: '5m', max: '1h', change, audience: 'public', quotable: true }),
  'sign-in.code-attempts': setting.integer({ default: 5, min: 3, max: 10, unit: 'core.units.attempts', change }),
  'sign-in.open-sign-up': setting.boolean({ default: true, change, audience: 'public' }),
  'sign-in.unverified-address-lifetime': setting.duration({ default: '7d', min: '1d', max: '30d', change }),
  'sign-in.invite-lifetime': setting.duration({ default: '7d', min: '1d', max: '30d', change }),
  'sign-in.google': setting.boolean({ default: false, change, audience: 'public' }),
  // Not in the specification's list: Google needs a client id as well as the secret, and an id is
  // not a secret, so it is a setting the theatre types in beside the switch.
  'sign-in.google-client-id': setting.text({ unset: true, maxLength: 200, change }),
  'sign-in.google-domains': setting.list({ default: [], of: 'text', maxLength: 253, change }),
  'sign-in.managed-domains': setting.list({ default: [], of: 'text', maxLength: 253, change, audience: 'public' }),
  'sign-in.provider-is-strong': setting.boolean({ default: false, change }),

  'sessions.lifetime': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
  'sessions.idle-limit': setting.duration({ default: '14d', min: '1h', max: '90d', change }),

  'recovery.enrolment-link-lifetime': setting.duration({ default: '24h', min: '1h', max: '7d', change }),
  'recovery.code-count': setting.integer({ default: 10, min: 6, max: 20, unit: 'core.units.codes', change }),

  'grants.default-expiry': setting.choice({ default: 'none', options: ['year-end', 'none'], change }),
  'grants.allow-no-expiry': setting.boolean({ default: true, change }),
  'grants.expiry-warning': setting.duration({ default: '14d', min: '1d', max: '60d', change }),

  'members-area.enabled': setting.boolean({ default: true, change, audience: 'public' }),
  'members-area.name': setting.text({ default: 'Members\' area', maxLength: 40, change, audience: 'public', quotable: true }),
  'emergency-contacts.keep-after-standing': setting.duration({ default: '30d', min: '0d', max: '365d', change }),

  'merge.undo-window': setting.duration({ default: '30d', min: '0d', max: '90d', change }),

  'privacy.cooling-off': setting.duration({ default: '7d', min: '0d', max: '30d', change, audience: 'public', quotable: true }),
  'privacy.respond-within': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
  // Erasure and the download are not offered until the theatre says who to contact about personal data.
  'privacy.export-lifetime': setting.duration({ default: '7d', min: '1d', max: '30d', change, audience: 'public', quotable: true }),
  'privacy.contact': setting.text({ unset: true, maxLength: 120, change, audience: 'public', quotable: true }),

  'access-scheme.enabled': setting.boolean({ default: true, change, audience: 'public' }),
  'access-scheme.name': setting.text({ default: 'Access scheme', maxLength: 40, change, audience: 'public', quotable: true }),
  'access-scheme.allow-note': setting.boolean({ default: true, change }),
  'access-scheme.companions-need-verified': setting.boolean({ default: false, change }),
  'access-scheme.reply-within': setting.duration({ default: '14d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
  'access-scheme.review-after': setting.duration({ default: '1095d', min: '365d', max: '3650d', change }),
  'access-scheme.keep-rejected': setting.duration({ default: '90d', min: '0d', max: '365d', change }),
})

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

export const identitySettingRules: SettingRule[] = [
  { id: 'idle-within-lifetime', check: s => s['sessions.idle-limit'] <= s['sessions.lifetime'] },
  { id: 'managed-domains-need-provider', check: s => !s['sign-in.managed-domains'].length || s['sign-in.google'] },
  { id: 'strong-provider-needs-managed-domain', check: s => !s['sign-in.provider-is-strong'] || s['sign-in.managed-domains'].length > 0 },
  // Ruling R-09: year-end expiry reads core.organisation.year-end, and cannot be chosen while it is unset.
  { id: 'default-expiry-needs-year-end', check: s => s['grants.default-expiry'] !== 'year-end' || !!s['organisation.year-end'] },
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
  'account.search': ability({ risk: 'normal', implies: ['account.find'], grantAt: ['site'] }),
  // findAccounts, the filter by a person's name or email on another module's list (part 4, "Finding
  // rows by a person's name or email"). Every use is audited as a read, naming the list.
  'account.find': ability({ risk: 'normal', fresh: false, audit: 'read', impliable: true, grantAt: ['site'] }),
  'account.read': ability({ on: 'core.account', risk: 'privileged', fresh: false, audit: 'read', owner: 'grants', implies: ['account.search'], grantAt: ['site'] }),
  'account.create': ability({ risk: 'privileged', implies: ['account.search'], grantAt: ['site'] }),
  'account.disable': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'account.recover': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  // The access scheme (ID-38 to ID-44). Not Owner or Administrator by default: the people who run
  // the scheme are given it.
  'access-scheme.read': ability({ on: 'core.account', risk: 'privileged', fresh: false, audit: 'read', owner: 'refuses', implies: ['account.search'], grantAt: ['site'] }),
  'access-scheme.review': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['access-scheme.read'], grantAt: ['site'] }),
  // The default ability a purpose's reader holds (part 5, the purpose point), and the welfare lead's.
  'access-profile.read': ability({ on: 'core.account', risk: 'privileged', fresh: false, audit: 'read', owner: 'refuses', grantAt: ['site'] }),
  'account.merge': ability({ on: 'core.account', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'data-request.manage': ability({ on: 'core.data-request', risk: 'privileged', owner: 'refuses', implies: ['account.read'], grantAt: ['site'] }),
  'session.end': ability({ on: 'core.account', risk: 'privileged', owner: 'grants', grantAt: ['site'] }),
  'role.read': ability({ risk: 'normal', audit: false, grantAt: ['site'] }),
  'role.manage': ability({ risk: 'privileged', implies: ['role.read'], grantAt: ['site'] }),
  'grant.read': ability({ risk: 'normal', implies: ['account.search'], audit: false, grantAt: ['site'] }),
  'grant.manage': ability({ on: 'core.grant', risk: 'privileged', owner: 'refuses', implies: ['grant.read'], grantAt: ['site', 'module', 'record'] }),
  'identity-settings.manage': ability({ risk: 'privileged', grantAt: ['site'] }),
  // Read one member's emergency contacts, with a reason. Strong but never asked again, so an
  // emergency is not slowed; an Owner does not hold it by being an Owner (OWNER_DOES_NOT_READ).
  'emergency-contact.read': ability({ on: 'core.account', risk: 'privileged', fresh: false, audit: 'read', owner: 'grants', grantAt: ['site'] }),
})

/**
 * Identity's one fact (part 6, "Facts"): the account holds at least one standing now. It sums the
 * standings and is not one itself; it is derived on every request and stored nowhere.
 */
export const identityFacts = defineFacts('core', {
  'member': factDecl(),
  // True while the person's access application is accepted (ID-43). Not a standing, and with no
  // holders, so nobody can list who is on the scheme through it.
  'access-scheme': factDecl(),
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
  // The two accounts parted again: the last unit of an undo.
  'core.account.merge-undone': event({ version: 1, payload: z.object({ survivorId: z.string(), mergedAccountId: z.string(), mergeId: z.string() }), internal: true }),
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
  // Stage two of a merge (part 4, Merge): `start` queues one chain per module, each `module` step is
  // one unit (a handler, or a share of the module's move columns), and `finish` sets completed_at
  // once nothing is left. Every step is safe to repeat.
  'core.merge-move': job({
    payload: z.object({
      mergeId: z.string(),
      stage: z.enum(['start', 'module', 'finish', 'undo-start', 'undo-module', 'undo-finish']),
      module: z.string().optional(),
      step: z.number().int().min(0).optional(),
    }),
    lane: 'prompt',
  }),
  // Builds a person's data download (ID-15). Safe to repeat: a finished request is left alone.
  'core.build-export': job({ payload: z.object({ requestId: z.string() }), lane: 'prompt' }),
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

/** Points identity offers other modules (spec part 5). */
export const identityPoints = {
  // Given an account, the hold codes that pause its erasure. Each code has a sentence for staff and
  // one for the person in the module's catalogue, at "<code>.staff" and "<code>.person".
  'core.erasure-hold': point({ kind: 'code', contract: 'erasure-hold' }),
  // A module's merge handler, for its onMerge 'handler' columns (the kit's MergeHandler). The merge
  // job runs a module's handlers, in the order given, before re-pointing its move columns.
  'core.merge-handler': point({ kind: 'code', contract: 'merge-handler' }),
  // Given an account, material for its data download that the registry cannot find (ID-15).
  'core.export-contributor': point({ kind: 'code', contract: 'export-contributor' }),
  // A reason a module reads access needs. The core knows none in advance (part 5, the purpose point).
  'core.access-purpose': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9-]+$/),
      side: z.enum(['audience', 'members']),
      label: z.string().min(1).max(80), // not-policy: a label's bounds
      explanation: z.string().min(1).max(300), // not-policy: the sentence beside the switch
      ability: z.string().optional(),
      uses: z.union([z.literal('all'), z.array(z.string()).min(1)]),
      note: z.boolean().optional(),
      on: z.string().optional(),
      // Applying to the scheme agrees to this purpose, and it cannot be switched off while on it.
      agreedOnApplying: z.boolean().optional(),
    }).strict(),
  }),
}

export const identityContributions = {
  // The welfare lead's purpose (members' side), off until the person switches it on. Box office
  // declares box-office.booking itself.
  'core.access-purpose': [{
    id: 'core.welfare',
    side: 'members' as const,
    label: 'The welfare lead',
    explanation: 'The theatre\'s welfare lead can read your access needs, so that they can look after you at rehearsals and events.',
    uses: 'all' as const,
    note: true,
  }],
  // The barriers a person can tick (part 3, "Storage and sharing"). Not locked: a theatre can edit it.
  'core.vocabulary': [{
    id: 'core.access-need',
    label: 'Access needs',
    description: 'The barriers a person can tick when they apply to the access scheme. Barriers, never diagnoses.',
    terms: [
      { slug: 'standing', label: 'Standing or queueing', description: 'You find it hard to stand for long or wait in a queue.' },
      { slug: 'crowds', label: 'Crowds and busy spaces', description: 'You find crowds, noise or busy foyers hard to cope with.' },
      { slug: 'level-access', label: 'Steps and stairs', description: 'You cannot use steps or stairs, so you need a ramp, a lift or a level route.' },
      { slug: 'distance', label: 'Walking distances', description: 'You can only walk a short way, so a seat near the entrance helps.' },
      { slug: 'urgent-toilet', label: 'Getting to a toilet quickly', description: 'You may need to leave at short notice, so a seat near the door and a toilet helps.' },
      { slug: 'visual-information', label: 'Hearing what is said', description: 'You need spoken information shown or written down, for example captions or a written note.' },
      { slug: 'audible-information', label: 'Seeing or reading information', description: 'You need written or visual information read out or described, for example audio description.' },
      // Not ticked on the form: set from its companions question and its "anything else" box.
      { slug: 'essential-companion', label: 'Needs a companion to help', description: 'Set when the person asks for a companion ticket.' },
      { slug: 'other', label: 'Something else (see their note)', description: 'Set when the person writes something in "anything else".' },
      // Asked as its own question: "I use a wheelchair", then whether they stay in it or transfer.
      { slug: 'wheelchair-stays', label: 'Wheelchair user, stays in their wheelchair', description: 'They need a wheelchair space.' },
      { slug: 'wheelchair-transfers', label: 'Wheelchair user, transfers to a seat', description: 'They move to an ordinary seat, and their wheelchair needs storing.' },
    ],
  }],
  // The companions a person on the scheme may book (ID-43), as core.access-scheme:companions.
  'core.requirement': [{ id: 'core.access-scheme', file: 'access-scheme' }],
  // The access scheme's screens (ID-38, ID-40). "Offered" is one while the scheme runs, so My
  // account's entry and section hide while it is off; "waiting" sits beside the console's entry.
  'core.count': [
    { id: 'core.access-scheme-offered', file: 'access-scheme-offered' },
    { id: 'core.access-scheme-waiting', file: 'access-scheme-waiting' },
    // Data requests that need staff: finished but not yet closed, or past their respond-by date (ID-35).
    { id: 'core.data-requests-waiting', file: 'data-requests-waiting' },
  ],
  'core.account-section': [
    { id: 'core.access-scheme', target: 'account' as const, side: 'audience' as const, ability: 'signed-in', component: 'CoreAccessScheme', order: 40, to: '/account/access', icon: 'i-lucide-accessibility', count: 'core.access-scheme-offered', hideEmpty: true },
  ],
  // The button a fork's own access page carries: ::access-application.
  'core.public-component': [
    { id: 'access-application', component: 'CoreAccessApplication', alias: 'access-application', description: 'The access scheme\'s "Apply" button, or where the visitor\'s application stands.', setting: 'core.access-scheme.enabled' },
  ],
  // The other identity messages (spec part 4) arrive with the stories that send them.
  'core.notification-type': [{
    // The code that confirms it is you in place, for a basic session with no passkey (ID-28). The
    // code is sealed: email only, kept encrypted and cleared once sent.
    id: 'core.reassert-code',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { code: 'sealed' as const },
    wording: {
      'en-GB': {
        subject: 'Your code to confirm it is you at {{ theatre }}',
        body: 'Type this code where you were asked to confirm it is you: **{{ code }}**\n\nIt works once, for a short while, in the browser that asked for it. If you did not ask for it, you can ignore this email; nobody can use it without your sign-in.',
      },
    },
  }, {
    id: 'core.sign-in-link',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    // Both sign the person in, so both are sealed.
    variables: { link: 'sealed' as const, code: 'sealed' as const },
    wording: {
      'en-GB': {
        subject: 'Sign in to {{ theatre }}',
        body: 'Use this link to sign in. It works once, in the browser where you asked for it.\n\n[Sign in]({{ link }})\n\nOr type this code on any device: **{{ code }}**\n\nIf you did not ask to sign in, you can ignore this email.',
      },
    },
  }, {
    // The single-use link to the form, by notifyAddress (ID-42). Sealed: email only, cleared once sent.
    id: 'core.access-invitation',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { link: 'sealed' as const, scheme: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Apply to the {{ scheme }} at {{ theatre }}',
        body: '{{ theatre }} has invited you to apply to its {{ scheme }}, so that what would help you is there every time you book.\n\n[Open the form]({{ link }})\n\nThe link signs you in and works once. If it has run out, sign in with this email address and choose Apply. If you were not expecting this, you can ignore this email.',
      },
    },
  }, {
    id: 'core.access-application-received',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { scheme: 'text' as const },
    link: '/account',
    wording: {
      'en-GB': {
        subject: 'We have your application to the {{ scheme }}',
        body: '{{ theatre }} has your application to the {{ scheme }}. The people who run it will read it and let you know.\n\nYou can see where it is, and correct it, in your account.',
      },
    },
  }, {
    // To the reviewers, once, when an application has waited longer than reply-within (ID-40).
    id: 'core.access-application-waiting',
    category: 'transactional' as const,
    side: 'members' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { scheme: 'text' as const, count: 'text' as const },
    link: '/console/people/access-scheme',
    wording: {
      'en-GB': {
        subject: 'Applications to the {{ scheme }} are waiting',
        body: 'Applications waiting longer than {{ theatre }} aims to answer: {{ count }}. The queue shows which.',
      },
    },
  }, {
    // The email names no need: there is news, and the account says what it is.
    id: 'core.access-application-decided',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { scheme: 'text' as const },
    link: '/account',
    wording: {
      'en-GB': {
        subject: 'News about your application to the {{ scheme }}',
        body: 'There is news about your application to the {{ scheme }} at {{ theatre }}. Sign in to your account to read it.',
      },
    },
  }, {
    id: 'core.access-review-due',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { scheme: 'text' as const },
    link: '/account',
    wording: {
      'en-GB': {
        subject: 'Are your details for the {{ scheme }} still right?',
        body: 'It has been a while since {{ theatre }} accepted your application to the {{ scheme }}. Please check your details in your account and confirm they are still right, or change them.\n\nYour arrangements stay in place meanwhile.',
      },
    },
  }, {
    // The link signs the person in, so it is sealed: never stored in clear in core_notifications.
    id: 'core.invitation',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { link: 'sealed' as const, role: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'You have been given a role at {{ theatre }}',
        body: 'You have been given the role {{ role }} at {{ theatre }}. Use this link to sign in and start: it works once.\n\n[Sign in]({{ link }})\n\nIf the link has run out, sign in with this email address and the role will be waiting. If you were not expecting this, you can ignore this email.',
      },
    },
  }, {
    id: 'core.address-verify',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { link: 'sealed' as const },
    wording: {
      'en-GB': {
        subject: 'Confirm your email address for {{ theatre }}',
        body: 'Use this link to confirm this address for your account. It works once.\n\n[Confirm this address]({{ link }})\n\nIf you did not add this address, you can ignore this email and nothing will change.',
      },
    },
  }, {
    id: 'core.credential-added',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { what: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Your sign-in at {{ theatre }} has changed',
        body: 'This was added to your account: {{ what }}.\n\nIf this was you, there is nothing to do. If it was not, contact the theatre straight away.',
      },
    },
  }, {
    // Two accounts were joined into one (part 4, Merge, "Tell both"), to every verified address of
    // both, read before the merge moved them. It names nobody, so it says nothing to an address
    // about another person's account.
    id: 'core.merge-notice',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: {},
    wording: {
      'en-GB': {
        subject: 'Your accounts at {{ theatre }} have been joined',
        body: 'Two accounts at {{ theatre }} that belong to you, including the one for this address, have been joined into one, so your bookings and history are now in one place. You sign in as before, with any of your addresses.\n\nIf you did not expect this, contact the theatre soon: for a while it can be undone.',
      },
    },
  }, {
    // A merge was undone (part 4, Merge, "Say what could not be put back"), to every verified
    // address of both accounts. `kept` is one of two fixed sentences: everything came back, or all but what a module's undo kept.
    id: 'core.merge-undone',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: { kept: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Your accounts at {{ theatre }} have been separated again',
        body: 'Two accounts at {{ theatre }} that had been joined, including the one for this address, are separate again. {{ kept }}\n\nIf you did not expect this, contact the theatre.',
      },
    },
  }, {
    // The download is ready (ID-15). It says when it will be removed, never what it holds.
    id: 'core.export-ready',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { until: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Your data from {{ theatre }} is ready',
        body: 'The download of your data you asked {{ theatre }} for is ready. Sign in to your account to get it. It is kept until {{ until }}, then removed.\n\nIf you did not ask for this, contact the theatre straight away.',
      },
    },
  }, {
    // To a holder, once per sweep, naming each of their roles that ends within
    // core.grants.expiry-warning (ID-24). Grants are the members' side.
    id: 'core.grant-expiring',
    category: 'transactional' as const,
    side: 'members' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { roles: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'A role of yours at {{ theatre }} is ending',
        body: 'These roles of yours at {{ theatre }} are ending:\n\n{{ roles }}\n\nIf you should keep one, ask whoever gave it to you to renew it. If not, there is nothing to do.',
      },
    },
  }, {
    // To whoever could renew those grants, once per sweep that found some (ID-24): a count and the
    // earliest end, never one message per grant, because at a year end most lapse together.
    id: 'core.grants-expiring',
    category: 'transactional' as const,
    side: 'members' as const,
    channels: ['email' as const, 'inbox' as const],
    lane: 'prompt' as const,
    variables: { count: 'text' as const, date: 'text' as const },
    wording: {
      'en-GB': {
        subject: 'Roles at {{ theatre }} are about to lapse',
        body: 'Roles you can renew are about to lapse: {{ count }}, the first on {{ date }}. Renew those that should carry on; the rest end by themselves.',
      },
    },
  }, {
    id: 'core.address-changed',
    category: 'transactional' as const,
    side: 'audience' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: {},
    wording: {
      'en-GB': {
        subject: 'Your email address at {{ theatre }} has changed',
        body: 'This address is no longer the one {{ theatre }} uses to write to you about tickets and your account.\n\nIf this was you, there is nothing to do. If it was not, contact the theatre straight away.',
      },
    },
  }, {
    id: 'core.members-address-changed',
    category: 'transactional' as const,
    side: 'members' as const,
    channels: ['email' as const],
    lane: 'prompt' as const,
    variables: {},
    wording: {
      'en-GB': {
        subject: 'Your members\' email address at {{ theatre }} has changed',
        body: 'This address is no longer the one {{ theatre }} uses for members\' messages.\n\nIf this was you, there is nothing to do. If it was not, contact the theatre straight away.',
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
  // The data download (ID-15): a zip the server makes, on the account, that only its owner reads.
  'core.file-slot': [{ id: 'core.data-download', owner: 'core.account', ability: 'core.data-request.manage', accepts: ['zip' as const], limit: 'core.files.document-limit', access: 'record' as const, textClass: 'personal' as const, clean: false, source: 'server' as const }],
  'core.file-access': [{ id: 'core.account', file: 'account' }],
  // The access application is special category data, sealed in its table, so the registry leaves
  // it out of the download; identity adds it opened, for its owner.
  'core.export-contributor': [{ id: 'core.access-scheme', file: 'access-scheme' }],
  'core.health-check': [
    { id: 'core.session-key', file: 'session-key' },
    { id: 'core.sign-in-challenge', file: 'sign-in-challenge' },
    { id: 'core.owner-recovery', file: 'owner-recovery' },
    { id: 'core.merges', file: 'merges' },
  ],
}
