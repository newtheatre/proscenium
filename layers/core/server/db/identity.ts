// Identity's tables (Identity and accounts specification, part 2): the account and how a person
// proves who they are, sessions, roles and grants, and the record of merges. Phase 1 holds the
// fourteen tables the first stories need; data requests, emergency contacts and access profiles
// arrive with their stories.
//
// Rules that a column declaration cannot carry are database triggers added by hand at the end of
// this table set's migration: an account row is never deleted and nothing personal is written back
// over a tombstone, and nobody grants themselves a role except the setup grant.
import { integer, text, index, primaryKey, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { defineTable, col } from '#kit/db'

export const ACCOUNT_ORIGINS = ['setup', 'self', 'guest', 'named-by-other', 'invite', 'staff'] as const
export const DISABLED_REASONS = ['security', 'conduct', 'requested', 'duplicate'] as const
export const TOKEN_PURPOSES = ['sign_in', 'verify_address', 'invite', 'enrol_passkey', 'owner_recovery', 'confirm_merge', 'confirm_erasure'] as const
export const SESSION_END_REASONS = ['signed_out', 'ended_by_person', 'ended_by_staff', 'credential_changed', 'disabled', 'merged', 'erased'] as const
export const GRANT_END_REASONS = ['revoked', 'replaced', 'role_archived', 'account_closed', 'merged', 'given_up'] as const

/** One row per person, kept for ever: after erasure it is a tombstone that history still points at. */
export const accounts = defineTable('core_accounts', {
  id: col.id(),
  name: col.personal(text('name'), { erase: 'clear' }),
  preferredName: col.personal(text('preferred_name'), { erase: 'clear' }),
  // Shown beside the name to members and staff and in the person's own account; never publicly.
  pronouns: col.personal(text('pronouns'), { erase: 'clear' }),
  phone: col.personal(text('phone'), { erase: 'clear' }),
  locale: col.internal(text('locale')),
  audienceEmailId: col.internal(text('audience_email_id')),
  membersEmailId: col.internal(text('members_email_id')),
  origin: col.internal(text('origin', { enum: ACCOUNT_ORIGINS }).notNull()),
  createdAt: col.createdAt(),
  firstSignedInAt: col.timestamp('first_signed_in_at'),
  lastSignedInAt: col.personal(integer('last_signed_in_at'), { erase: 'clear' }),
  disabledAt: col.timestamp('disabled_at'),
  disabledReason: col.internal(text('disabled_reason', { enum: DISABLED_REASONS })),
  // The merge mechanism itself, not a reference a merge rewrites.
  mergedIntoId: col.internal(text('merged_into_id')),
  mergedAt: col.timestamp('merged_at'),
  anonymisedAt: col.timestamp('anonymised_at'),
}, {
  id: 'acc',
  realm: 'operational',
  subject: 'id',
  extra: t => [
    check('core_accounts_not_merged_into_itself', sql`merged_into_id IS NULL OR merged_into_id <> id`),
    check('core_accounts_name_length', sql`name IS NULL OR length(name) BETWEEN 1 AND 120`),
    check('core_accounts_preferred_name_length', sql`preferred_name IS NULL OR length(preferred_name) <= 60`),
    check('core_accounts_pronouns_length', sql`pronouns IS NULL OR length(pronouns) BETWEEN 1 AND 40`),
    index('core_accounts_merged_into').on(t.mergedIntoId),
  ],
})

/** An address belongs to one account at a time; the unique index is the write that stops two accounts being made for one address. */
export const accountEmails = defineTable('core_account_emails', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move' }),
  address: col.email('address').notNull(),
  verifiedAt: col.timestamp('verified_at'),
  addedBy: col.internal(text('added_by', { enum: ['self', 'checkout', 'staff', 'provider', 'setup'] }).notNull()),
  createdAt: col.createdAt(),
}, {
  id: 'aem',
  realm: 'operational',
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_account_emails_address').on(t.address), index('core_account_emails_account').on(t.accountId)],
})

export const passkeys = defineTable('core_passkeys', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move' }),
  credentialId: col.internal(text('credential_id').notNull()),
  publicKey: col.internal(text('public_key').notNull()),
  signCount: col.internal(integer('sign_count').notNull().default(0)),
  transports: col.internal(text('transports')),
  authenticator: col.internal(text('authenticator')),
  synced: col.internal(integer('synced', { mode: 'boolean' }).notNull().default(false)),
  label: col.personal(text('label').notNull()),
  createdAt: col.createdAt(),
  lastUsedAt: col.personal(integer('last_used_at'), { erase: 'clear' }),
}, {
  id: 'pky',
  realm: 'operational',
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_passkeys_credential').on(t.credentialId), index('core_passkeys_account').on(t.accountId)],
})

/** A link between an account and an identity at an outside provider. Google is the first. */
export const federatedIdentities = defineTable('core_federated_identities', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move' }),
  provider: col.internal(text('provider').notNull()),
  subject: col.personal(text('subject').notNull()),
  hostedDomain: col.internal(text('hosted_domain')),
  emailId: col.internal(text('email_id')),
  linkedAt: col.timestamp('linked_at').notNull(),
  lastUsedAt: col.personal(integer('last_used_at'), { erase: 'clear' }),
}, {
  id: 'fid',
  realm: 'operational',
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_federated_identities_subject').on(t.provider, t.subject), index('core_federated_identities_account').on(t.accountId)],
})

/** On merge the losing account's codes are deleted; the survivor keeps its own. */
export const recoveryCodes = defineTable('core_recovery_codes', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  codeHash: col.internal(text('code_hash').notNull()),
  createdAt: col.createdAt(),
  usedAt: col.timestamp('used_at'),
}, {
  id: 'rcc',
  random: true,
  realm: 'operational',
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_recovery_codes_hash').on(t.codeHash), index('core_recovery_codes_account').on(t.accountId)],
})

/** Every single-use secret sent to a person or handed to them. Only a keyed hash is stored. */
export const accountTokens = defineTable('core_account_tokens', {
  id: col.id(),
  purpose: col.internal(text('purpose', { enum: TOKEN_PURPOSES }).notNull()),
  tokenHash: col.internal(text('token_hash').notNull()),
  codeHash: col.internal(text('code_hash')),
  browserHash: col.internal(text('browser_hash')),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler', nullable: true }),
  address: col.email('address'),
  issuedBy: col.account('issued_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  nextPath: col.internal(text('next_path')),
  attempts: col.internal(integer('attempts').notNull().default(0)),
  createdAt: col.createdAt(),
  expiresAt: col.timestamp('expires_at').notNull(),
  usedAt: col.timestamp('used_at'),
}, {
  id: 'tok',
  random: true,
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_account_tokens_hash').on(t.tokenHash), index('core_account_tokens_address').on(t.purpose, t.address, t.createdAt), index('core_account_tokens_expiry').on(t.expiresAt)],
})

/** The short-lived challenge behind a passkey ceremony, read back exactly once. */
export const passkeyChallenges = defineTable('core_passkey_challenges', {
  id: col.id(),
  purpose: col.internal(text('purpose', { enum: ['register', 'sign_in', 'reassert', 'setup', 'owner_recovery'] }).notNull()),
  challenge: col.internal(text('challenge').notNull()),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler', nullable: true }),
  sessionId: col.internal(text('session_id')),
  expiresAt: col.timestamp('expires_at').notNull(),
  usedAt: col.timestamp('used_at'),
}, {
  id: 'pch',
  random: true,
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  onErasure: 'delete-row',
  extra: t => [index('core_passkey_challenges_expiry').on(t.expiresAt)],
})

/** One row per signed-in browser. The cookie holds a random token; this table holds its keyed hash. */
export const sessions = defineTable('core_sessions', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  tokenHash: col.internal(text('token_hash').notNull()),
  methods: col.internal(text('methods').notNull()),
  assurance: col.internal(text('assurance', { enum: ['basic', 'strong'] }).notNull()),
  reassertedAt: col.timestamp('reasserted_at'),
  device: col.personal(text('device').notNull()),
  createdAt: col.createdAt(),
  lastSeenAt: col.personal(integer('last_seen_at').notNull()),
  expiresAt: col.timestamp('expires_at').notNull(),
  endedAt: col.timestamp('ended_at'),
  endedReason: col.internal(text('ended_reason', { enum: SESSION_END_REASONS })),
}, {
  id: 'ses',
  random: true,
  realm: 'operational',
  onErasure: 'delete-row',
  extra: t => [uniqueIndex('core_sessions_token').on(t.tokenHash), index('core_sessions_account').on(t.accountId, t.endedAt)],
})

/** Roles are rows a theatre edits. The platform ships presets and one fixed role, Owner. */
export const roles = defineTable('core_roles', {
  id: col.id(),
  key: col.internal(text('key').notNull()),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  fixed: col.internal(integer('fixed', { mode: 'boolean' }).notNull().default(false)),
  opensMembersArea: col.internal(integer('opens_members_area', { mode: 'boolean' }).notNull().default(false)),
  needsManagedIdentity: col.internal(integer('needs_managed_identity', { mode: 'boolean' }).notNull().default(false)),
  expiryRule: col.internal(text('expiry_rule', { enum: ['year_end', 'days', 'none'] }).notNull()),
  expiryDays: col.internal(integer('expiry_days')),
  preset: col.internal(text('preset')),
  createdAt: col.createdAt(),
  archivedAt: col.timestamp('archived_at'),
}, {
  id: 'rol',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_roles_key').on(t.key),
    check('core_roles_expiry_days', sql`(expiry_rule = 'days') = (expiry_days IS NOT NULL)`),
  ],
})

export const roleAbilities = defineTable('core_role_abilities', {
  roleId: col.ref('core_roles'),
  ability: col.internal(text('ability').notNull()),
}, { realm: 'operational', subject: 'none', extra: t => [primaryKey({ columns: [t.roleId, t.ability] })] })

/** Which abilities the theatre attached to a fact a module declares, the same shape as a role's. */
export const factAbilities = defineTable('core_fact_abilities', {
  fact: col.internal(text('fact').notNull()),
  ability: col.internal(text('ability').notNull()),
  pinnedRecord: col.internal(text('pinned_record').notNull().default('')),
  confirmedPrivilegedAt: col.timestamp('confirmed_privileged_at'),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias' }),
  createdAt: col.createdAt(),
}, { realm: 'operational', extra: t => [primaryKey({ columns: [t.fact, t.ability, t.pinnedRecord] })] })

/**
 * A role given to an account. Append-only, so the history answers who could do what on any past
 * date: ending a grant is a row in core_grant_ends, and a renewal is a new grant.
 */
export const grants = defineTable('core_grants', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias' }),
  roleId: col.ref('core_roles'),
  scope: col.internal(text('scope', { enum: ['site', 'module', 'record'] }).notNull()),
  scopeModule: col.internal(text('scope_module')),
  scopeType: col.internal(text('scope_type')),
  scopeId: col.internal(text('scope_id')),
  startsAt: col.timestamp('starts_at').notNull(),
  expiresAt: col.timestamp('expires_at'),
  grantedBy: col.account('granted_by', { role: 'actor', onMerge: 'alias' }),
  grantedAt: col.timestamp('granted_at').notNull(),
}, {
  id: 'gra',
  realm: 'operational',
  appendOnly: true,
  extra: t => [
    index('core_grants_account').on(t.accountId),
    index('core_grants_role').on(t.roleId),
    check('core_grants_scope', sql`(scope = 'site' AND scope_module IS NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'module' AND scope_module IS NOT NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'record' AND scope_module IS NOT NULL AND scope_type IS NOT NULL AND scope_id IS NOT NULL)`),
  ],
})

/** The end of a grant: written once, never changed. A grant with no row here and no past expiry is live. */
export const grantEnds = defineTable('core_grant_ends', {
  grantId: col.ref('core_grants'),
  endedAt: col.timestamp('ended_at').notNull(),
  endedBy: col.account('ended_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  endedReason: col.internal(text('ended_reason', { enum: GRANT_END_REASONS }).notNull()),
}, { realm: 'operational', appendOnly: true, extra: t => [uniqueIndex('core_grant_ends_grant').on(t.grantId)] })

/** The record of a merge, and below it the list of what moved, so that it can be undone. */
export const accountMerges = defineTable('core_account_merges', {
  id: col.id(),
  survivorId: col.account('survivor_id', { role: 'subject', onMerge: 'alias' }),
  mergedAccountId: col.account('merged_account_id', { role: 'subject', onMerge: 'alias' }),
  startedBy: col.internal(text('started_by', { enum: ['person', 'staff', 'claim'] }).notNull()),
  performedBy: col.account('performed_by', { role: 'actor', onMerge: 'alias' }),
  performedAt: col.timestamp('performed_at').notNull(),
  undoUntil: col.timestamp('undo_until').notNull(),
  undoneAt: col.timestamp('undone_at'),
  undoneBy: col.account('undone_by', { role: 'actor', onMerge: 'alias', nullable: true }),
}, {
  id: 'mrg',
  realm: 'operational',
  extra: t => [uniqueIndex('core_account_merges_merged_account').on(t.mergedAccountId).where(sql`undone_at IS NULL`)],
})

/** One row moved or ended by a merge: the list an undo walks. `row_id` is the row's SQLite rowid, or a grant's id. */
export const accountMergeItems = defineTable('core_account_merge_items', {
  mergeId: col.ref('core_account_merges'),
  tableName: col.internal(text('table_name').notNull()),
  columnName: col.internal(text('column_name').notNull()),
  rowId: col.internal(text('row_id').notNull()),
  action: col.internal(text('action', { enum: ['moved', 'ended'] }).notNull()),
}, { realm: 'operational', subject: 'none', extra: t => [primaryKey({ columns: [t.mergeId, t.tableName, t.columnName, t.rowId] })] })

/**
 * Somebody to ring for a member (ID-17): up to three per account, members' side only. A row is
 * written and read only while the account has a standing. It describes a third person, so it is
 * never in a list, a search or anybody else's export. `standing_lost_at` is when the daily sweep
 * first found the account without a standing; the rows go `core.emergency-contacts.keep-after-standing`
 * after that, and it is cleared if a standing returns first.
 */
export const emergencyContacts = defineTable('core_emergency_contacts', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move' }),
  name: col.personal(text('name').notNull()),
  relationship: col.personal(text('relationship')),
  phone: col.personal(text('phone').notNull()),
  updatedAt: col.timestamp('updated_at').notNull(),
  standingLostAt: col.timestamp('standing_lost_at'),
}, {
  id: 'emc',
  realm: 'members',
  onErasure: 'delete-row',
  extra: t => [index('core_emergency_contacts_account').on(t.accountId), check('core_emergency_contacts_relationship', sql`${t.relationship} IS NULL OR length(${t.relationship}) BETWEEN 1 AND 40`)],
})

export const DATA_REQUEST_KINDS = ['export', 'erasure'] as const
export const DATA_REQUEST_STATES = ['requested', 'confirmed', 'held', 'running', 'done', 'cancelled', 'failed'] as const
/** How staff checked who somebody was when they started a request for them (ID-35). */
export const IDENTITY_CHECKS = ['signed-in', 'email-reply', 'in-person', 'document', 'known'] as const

/**
 * A request to download or erase a person's data, by them or by staff for them (ID-15, ID-16,
 * ID-35). Kept as the record that the request was met; it holds no personal content.
 */
export const dataRequests = defineTable('core_data_requests', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias' }),
  kind: col.internal(text('kind', { enum: DATA_REQUEST_KINDS }).notNull()),
  state: col.internal(text('state', { enum: DATA_REQUEST_STATES }).notNull()),
  requestedBy: col.account('requested_by', { role: 'actor', onMerge: 'alias' }),
  requestedAt: col.timestamp('requested_at').notNull(),
  // Null when the person asked for themselves, signed in.
  identityCheck: col.internal(text('identity_check', { enum: IDENTITY_CHECKS })),
  respondBy: col.timestamp('respond_by').notNull(),
  notBefore: col.timestamp('not_before'),
  // A JSON list of the hold codes modules raised, never free text.
  holds: col.internal(text('holds')),
  fileId: col.internal(text('file_id')),
  finishedAt: col.timestamp('finished_at'),
  // Staff close a request once every unlinked table has been searched by hand.
  closedAt: col.timestamp('closed_at'),
  closedBy: col.account('closed_by', { role: 'actor', onMerge: 'alias', nullable: true }),
}, {
  id: 'dreq',
  realm: 'operational',
  extra: t => [index('core_data_requests_account').on(t.accountId, t.kind, t.state), index('core_data_requests_state').on(t.state, t.notBefore)],
})

/** One line of a request's hand-search checklist: a table that may hold rows linked to no account. */
export const dataRequestChecks = defineTable('core_data_request_checks', {
  requestId: col.ref('core_data_requests'),
  tableName: col.internal(text('table_name').notNull()),
  outcome: col.internal(text('outcome', { enum: ['nothing-found', 'handled'] }).notNull()),
  tickedBy: col.account('ticked_by', { role: 'actor', onMerge: 'alias' }),
  tickedAt: col.timestamp('ticked_at').notNull(),
}, { realm: 'operational', subject: 'none', extra: t => [primaryKey({ columns: [t.requestId, t.tableName] })] })

export const ACCESS_STATUSES = ['submitted', 'more-info', 'accepted', 'rejected'] as const
export const VERIFIED_METHODS = ['access-card', 'document', 'known'] as const

/**
 * A person's application to the access scheme and, once accepted, the needs in force (ID-38 to
 * ID-44). At most one per account. What it says may reveal health, so it is held in special columns,
 * sealed, and never searched, filtered or listed outside the reviewers' queue.
 */
export const accessProfiles = defineTable('core_access_profiles', {
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  status: col.internal(text('status', { enum: ACCESS_STATUSES }).notNull()),
  // The needs and companions in force; set exactly while accepted.
  payload: col.special('payload'),
  // An application or a change waiting for a decision.
  pending: col.special('pending'),
  // The reviewer's latest message to the person.
  message: col.special('message'),
  submittedAt: col.timestamp('submitted_at').notNull(),
  submittedVia: col.internal(text('submitted_via', { enum: ['self', 'staff'] }).notNull()),
  submittedBy: col.account('submitted_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  decidedAt: col.timestamp('decided_at'),
  decidedBy: col.account('decided_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  verifiedAt: col.timestamp('verified_at'),
  verifiedBy: col.account('verified_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  verifiedMethod: col.special('verified_method'),
  // The companions the verification was seen for: a change to the number clears the mark.
  verifiedCompanions: col.internal(integer('verified_companions')),
  reviewDue: col.timestamp('review_due'),
  reminders: col.internal(integer('reminders').notNull().default(0)),
  flaggedAt: col.timestamp('flagged_at'),
  updatedAt: col.updatedAt(),
}, {
  realm: 'audience',
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.accountId] }),
    check('core_access_profiles_payload_when_accepted', sql`(status = 'accepted') = (payload IS NOT NULL)`),
    check('core_access_profiles_verified_when_accepted', sql`verified_at IS NULL OR status = 'accepted'`),
  ],
})

/** One row for each purpose a person agreed may read their access needs. No row, no sharing. */
export const accessShares = defineTable('core_access_shares', {
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  purpose: col.internal(text('purpose').notNull()),
  createdAt: col.createdAt(),
}, { realm: 'audience', onErasure: 'delete-row', extra: t => [primaryKey({ columns: [t.accountId, t.purpose] })] })

export const identityTables = {
  accounts, accountEmails, passkeys, federatedIdentities, recoveryCodes, accountTokens, passkeyChallenges, sessions,
  roles, roleAbilities, factAbilities, grants, grantEnds, accountMerges, accountMergeItems, emergencyContacts, dataRequests, dataRequestChecks, accessProfiles, accessShares,
}
