// Membership (Membership specification, tab 2): seven tables. A person is always an account id,
// except on a verification list entry, which stands for somebody who may have no account. Whether
// a membership is current is never stored: it is read from the state and the dates (rule D1).
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const SCHEME_STATES = ['draft', 'open', 'closed', 'archived'] as const
export const SIDES = ['members', 'audience'] as const
export const JOIN_MODES = ['apply', 'staff-only'] as const
export const LENGTH_RULES = ['fixed', 'rolling', 'indefinite'] as const
export const MEMBERSHIP_STATES = ['pending', 'active', 'declined', 'expired', 'ended'] as const
export const ORIGINS = ['applied', 'added', 'renewed', 'action'] as const
export const END_REASONS = ['by-holder', 'by-staff', 'refunded', 'superseded', 'erased'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** The schemes a theatre offers: "Student member", "Friend of the theatre". */
export const schemes = defineTable('membership_schemes', {
  id: col.id(),
  key: col.public(text('key').notNull()),
  name: col.public(text('name').notNull()),
  summary: col.public(text('summary')),
  side: col.internal(text('side', { enum: SIDES }).notNull()),
  state: col.internal(text('state', { enum: SCHEME_STATES }).notNull().default('draft')),
  joinMode: col.internal(text('join_mode', { enum: JOIN_MODES }).notNull().default('apply')),
  lengthRule: col.internal(text('length_rule', { enum: LENGTH_RULES }).notNull()),
  fixedEndMonth: col.internal(integer('fixed_end_month')),
  fixedEndDay: col.internal(integer('fixed_end_day')),
  rolloverDays: col.internal(integer('rollover_days').notNull().default(0)),
  renewalOpensDays: col.internal(integer('renewal_opens_days').notNull()),
  graceDays: col.internal(integer('grace_days').notNull()),
  // The id of a contribution to membership.verifier, or null when nothing is checked.
  verifier: col.internal(text('verifier')),
  verifierConfig: col.internal(text('verifier_config')),
  reverifyOnRenewal: col.internal(integer('reverify_on_renewal', { mode: 'boolean' }).notNull().default(true)),
  needsApproval: col.internal(integer('needs_approval', { mode: 'boolean' }).notNull().default(false)),
  requiresPayment: col.internal(integer('requires_payment', { mode: 'boolean' }).notNull().default(false)),
  voting: col.internal(integer('voting', { mode: 'boolean' }).notNull().default(false)),
  acceptsReference: col.internal(integer('accepts_reference', { mode: 'boolean' }).notNull().default(false)),
  holderMayEnd: col.internal(integer('holder_may_end', { mode: 'boolean' }).notNull()),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'msch',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('membership_schemes_key').on(t.key),
    index('membership_schemes_state').on(t.state, t.position),
    check('membership_schemes_side', sql`${t.side} IN (${inList(SIDES)})`),
    check('membership_schemes_state_values', sql`${t.state} IN (${inList(SCHEME_STATES)})`),
    check('membership_schemes_join_mode', sql`${t.joinMode} IN (${inList(JOIN_MODES)})`),
    check('membership_schemes_length_rule', sql`${t.lengthRule} IN (${inList(LENGTH_RULES)})`),
    // A fixed end date exactly when the length rule is fixed; 29 February is refused.
    check('membership_schemes_fixed_end', sql`(${t.lengthRule} = 'fixed') = (${t.fixedEndMonth} IS NOT NULL AND ${t.fixedEndDay} IS NOT NULL)`),
    check('membership_schemes_fixed_end_valid', sql`${t.fixedEndMonth} IS NULL OR (${t.fixedEndMonth} BETWEEN 1 AND 12 AND ${t.fixedEndDay} BETWEEN 1 AND (CASE WHEN ${t.fixedEndMonth} = 2 THEN 28 WHEN ${t.fixedEndMonth} IN (4, 6, 9, 11) THEN 30 ELSE 31 END))`),
    check('membership_schemes_rollover', sql`${t.rolloverDays} BETWEEN 0 AND 180`),
    check('membership_schemes_renewal_opens', sql`${t.renewalOpensDays} BETWEEN 0 AND 180`),
    check('membership_schemes_grace', sql`${t.graceDays} BETWEEN 0 AND 90`),
  ],
})

/** The lengths a scheme can be held for: "1 year", "3 years". */
export const lengthOptions = defineTable('membership_length_options', {
  id: col.id(),
  schemeId: col.ref('membership_schemes'),
  name: col.public(text('name').notNull()),
  // Scheme years for a fixed scheme, months for a rolling one.
  count: col.internal(integer('count').notNull()),
  state: col.internal(text('state', { enum: ['offered', 'withdrawn'] }).notNull().default('offered')),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
}, {
  id: 'mlo',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('membership_length_options_count').on(t.schemeId, t.count),
    check('membership_length_options_count_range', sql`${t.count} BETWEEN 1 AND 120`),
    check('membership_length_options_state', sql`${t.state} IN ('offered', 'withdrawn')`),
  ],
})

/** One person's holding of one scheme for one span. */
export const memberships = defineTable('membership_memberships', {
  id: col.id(),
  // Moved by membership's merge handler (X2): one open application per person per scheme, so a duplicate is superseded first.
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  schemeId: col.ref('membership_schemes'),
  lengthOptionId: col.ref('membership_length_options', { nullable: true }),
  realm: col.internal(text('realm', { enum: SIDES }).notNull()),
  state: col.internal(text('state', { enum: MEMBERSHIP_STATES }).notNull()),
  origin: col.internal(text('origin', { enum: ORIGINS }).notNull()),
  renewsId: col.ref('membership_memberships', { nullable: true }),
  // The application, when there was a form. The form builder's table, by id only until it exists.
  responseId: col.internal(text('response_id')),
  startsOn: col.localDate('starts_on'),
  endsOn: col.localDate('ends_on'),
  needsVerification: col.internal(integer('needs_verification', { mode: 'boolean' }).notNull()),
  needsApproval: col.internal(integer('needs_approval', { mode: 'boolean' }).notNull()),
  needsPayment: col.internal(integer('needs_payment', { mode: 'boolean' }).notNull()),
  verifiedAt: col.timestamp('verified_at'),
  approvedAt: col.timestamp('approved_at'),
  paidAt: col.timestamp('paid_at'),
  activatedAt: col.timestamp('activated_at'),
  expiresAt: col.timestamp('expires_at'),
  endedAt: col.timestamp('ended_at'),
  endReason: col.internal(text('end_reason', { enum: END_REASONS })),
  addedBy: col.account('added_by', { role: 'actor', nullable: true }),
  endedBy: col.account('ended_by', { role: 'actor', nullable: true }),
  note: col.freeText(text('note')),
  lastReminder: col.internal(text('last_reminder', { enum: ['window-open', 'final', 'lapsed'] })),
  lapseAnnouncedAt: col.timestamp('lapse_announced_at'),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'mshp',
  realm: { column: 'realm' },
  retention: 'membership.retention.ended-after',
  extra: t => [
    // J3: one open application per person per scheme.
    uniqueIndex('membership_memberships_one_pending').on(t.accountId, t.schemeId).where(sql`state = 'pending'`),
    // R3: a membership is renewed once.
    uniqueIndex('membership_memberships_renewed_once').on(t.renewsId).where(sql`state IN ('pending', 'active') AND renews_id IS NOT NULL`),
    index('membership_memberships_standing').on(t.accountId, t.state, t.startsOn, t.endsOn),
    index('membership_memberships_scheme').on(t.schemeId, t.state, t.endsOn),
    check('membership_memberships_realm', sql`${t.realm} IN (${inList(SIDES)})`),
    check('membership_memberships_state', sql`${t.state} IN (${inList(MEMBERSHIP_STATES)})`),
    check('membership_memberships_origin', sql`${t.origin} IN (${inList(ORIGINS)})`),
    // A1: nothing is active with a requirement unmet.
    check('membership_memberships_active', sql`${t.state} <> 'active' OR (${t.startsOn} IS NOT NULL AND ${t.activatedAt} IS NOT NULL AND (${t.needsVerification} = 0 OR ${t.verifiedAt} IS NOT NULL) AND (${t.needsApproval} = 0 OR ${t.approvedAt} IS NOT NULL) AND (${t.needsPayment} = 0 OR ${t.paidAt} IS NOT NULL))`),
    check('membership_memberships_dates', sql`${t.endsOn} IS NULL OR ${t.startsOn} IS NULL OR ${t.endsOn} >= ${t.startsOn}`),
    check('membership_memberships_ended', sql`(${t.state} = 'ended') = (${t.endReason} IS NOT NULL)`),
    check('membership_memberships_end_reason', sql`${t.endReason} IS NULL OR ${t.endReason} IN (${inList(END_REASONS)})`),
  ],
})

/** One row per person who has ever held a membership: their member number, never reused. */
export const members = defineTable('membership_members', {
  id: col.id(),
  // Alias, where the specification has a handler (rule X2): both accounts' rows stay as they are and
  // the account scope finds both, so the lower number and the earlier date are what the person sees.
  // A handler would hold every merge up while the module is off, for no difference anyone can see.
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias' }),
  number: col.internal(integer('number').notNull()),
  firstJoinedOn: col.localDate('first_joined_on').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'mbr',
  realm: 'members',
  onErasure: 'keep-row',
  extra: t => [
    uniqueIndex('membership_members_account').on(t.accountId),
    uniqueIndex('membership_members_number').on(t.number),
    check('membership_members_number_positive', sql`${t.number} >= 1`),
  ],
})

/** Each verification outcome for a membership, newest last. */
export const verifications = defineTable('membership_verifications', {
  id: col.id(),
  membershipId: col.ref('membership_memberships'),
  verifier: col.internal(text('verifier').notNull()),
  outcome: col.internal(text('outcome', { enum: ['passed', 'failed', 'needs-staff'] }).notNull()),
  reason: col.internal(text('reason')),
  entryId: col.ref('membership_verification_entries', { nullable: true }),
  decidedBy: col.account('decided_by', { role: 'actor', nullable: true }),
  note: col.freeText(text('note')),
  createdAt: col.createdAt(),
}, {
  id: 'mver',
  realm: 'operational',
  subject: { via: 'membership_id' },
  retention: 'membership.retention.ended-after',
  appendOnly: true,
  extra: t => [
    index('membership_verifications_membership').on(t.membershipId),
    check('membership_verifications_outcome', sql`${t.outcome} IN ('passed', 'failed', 'needs-staff')`),
  ],
})

/** An uploaded list a scheme checks against, such as a students' union's. */
export const verificationLists = defineTable('membership_verification_lists', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  keyKind: col.internal(text('key_kind', { enum: ['email', 'reference'] }).notNull()),
  entryCount: col.internal(integer('entry_count').notNull().default(0)),
  validUntil: col.localDate('valid_until'),
  uploadedBy: col.account('uploaded_by', { role: 'actor' }),
  uploadedAt: col.timestamp('uploaded_at').notNull(),
  // The whole phrase shown as the checkout field's label (rule V13), never a bare noun.
  referenceLabel: col.public(text('reference_label')),
  // A short noun for sentences such as "That student ID is not on the list", so a message never
  // splices the whole question in. Null on lists made before it existed: messages then say "reference".
  referenceNoun: col.public(text('reference_noun')),
  // digits or letters-and-digits, with a length range, as JSON. Never a free pattern (rule V15).
  referenceShape: col.internal(text('reference_shape')),
  createdAt: col.createdAt(),
}, {
  id: 'mvl',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    check('membership_verification_lists_kind', sql`${t.keyKind} IN ('email', 'reference')`),
    check('membership_verification_lists_label', sql`${t.keyKind} <> 'reference' OR ${t.referenceLabel} IS NOT NULL`),
    check('membership_verification_lists_count', sql`${t.entryCount} >= 0`),
  ],
})

/** The entries of a list, as keyed hashes. The plain value is never stored. */
export const verificationEntries = defineTable('membership_verification_entries', {
  id: col.id(),
  listId: col.ref('membership_verification_lists'),
  keyHash: col.personal(text('key_hash').notNull()),
  endsOn: col.localDate('ends_on'),
  // The name on the issuer's file, for staff only, one entry at a time (rule V18).
  holderName: col.personal(text('holder_name')),
  usedBy: col.ref('membership_memberships', { nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'mve',
  realm: 'operational',
  // An entry reaches a person once a membership has claimed it, and erasing that person reaches it
  // through the membership. An unclaimed entry is swept with its list.
  subject: { via: 'used_by' },
  retention: 'membership.verification.list-keep-for',
  extra: t => [
    uniqueIndex('membership_verification_entries_key').on(t.listId, t.keyHash),
  ],
})

export const tables = { schemes, lengthOptions, memberships, members, verifications, verificationLists, verificationEntries }
