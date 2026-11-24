// The core domain's tables (workstream 3, part 2): stored files, who mail comes from, the
// vocabularies every module shares, and notifications. The rest arrive with the later slices.
import { check, integer, real, text, index, primaryKey, uniqueIndex, foreignKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { defineTable, col } from '#kit/db'

/**
 * One row for every stored file, whichever module it belongs to. The bytes are in R2 under an
 * opaque key; the row is the only way to reach them. The id is random because it is the address.
 */
export const files = defineTable('core_files', {
  id: col.id(),
  objectKey: col.internal(text('object_key').notNull().unique()),
  ownerType: col.internal(text('owner_type').notNull()),
  ownerId: col.internal(text('owner_id').notNull()),
  slot: col.internal(text('slot').notNull()),
  sort: col.internal(integer('sort').notNull().default(0)),
  originalName: col.personal(text('original_name'), { erase: 'clear' }),
  textClass: col.internal(text('text_class').notNull()),
  title: col.perRow(text('title'), { classColumn: 'text_class' }),
  altText: col.perRow(text('alt_text'), { classColumn: 'text_class' }),
  mediaType: col.internal(text('media_type').notNull()),
  byteSize: col.internal(integer('byte_size').notNull()),
  sha256: col.internal(text('sha256').notNull()),
  width: col.internal(integer('width')),
  height: col.internal(integer('height')),
  access: col.internal(text('access').notNull()),
  state: col.internal(text('state').notNull().default('pending')),
  rejectedReason: col.internal(text('rejected_reason')),
  uploadedBy: col.account('uploaded_by', { role: 'subject', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
  readyAt: col.timestamp('ready_at'),
  attachedAt: col.timestamp('attached_at'),
  deletedAt: col.timestamp('deleted_at'),
  purgeAfter: col.timestamp('purge_after'),
  // A file the server made for a while only, such as a data download: removed once this passes.
  expiresAt: col.timestamp('expires_at'),
}, {
  id: 'fil',
  random: true,
  realm: 'operational',
  subject: { account: 'uploaded_by', unlinked: 'staff' },
  retention: 'core.files.deleted-retention',
  extra: t => [
    index('core_files_owner').on(t.ownerType, t.ownerId, t.slot, t.sort),
    index('core_files_purge').on(t.state, t.purgeAfter),
    index('core_files_expiry').on(t.expiresAt),
    check('core_files_byte_size', sql`${t.byteSize} > 0`),
  ],
})

/** Who mail comes from. No row is needed for the default sender: it is built from the settings. */
export const senderIdentities = defineTable('core_sender_identities', {
  key: col.internal(text('key').primaryKey()),
  displayName: col.public(text('display_name').notNull()),
  localPart: col.public(text('local_part').notNull()),
  replyTo: col.internal(text('reply_to')),
  state: col.internal(text('state').notNull().default('active')),
}, { realm: 'operational', subject: 'none', extra: t => [uniqueIndex('core_sender_identities_local_part').on(t.localPart)] })

/** Which sender each topic uses. No row means the default sender. */
export const notificationRouting = defineTable('core_notification_routing', {
  topicKey: col.internal(text('topic_key').primaryKey()),
  senderKey: col.internal(text('sender_key').notNull().references(() => senderIdentities.key, { onDelete: 'restrict' })),
}, { realm: 'operational', subject: 'none' })

/**
 * A reusable list of options a theatre can edit (group 3). A module declares its own through the
 * point core.vocabulary and they are made the first time they are needed; a theatre's own have
 * keys beginning `x.`.
 */
export const vocabularies = defineTable('core_vocabularies', {
  key: col.internal(text('key').primaryKey()),
  owner: col.internal(text('owner').notNull()),
  label: col.internal(text('label').notNull()),
  description: col.internal(text('description')),
  ordering: col.internal(text('ordering').notNull().default('manual')),
  locked: col.internal(integer('locked', { mode: 'boolean' }).notNull().default(false)),
  termClass: col.internal(text('term_class').notNull().default('public')),
  // A grouped vocabulary keeps its terms under headings, and every live term needs one.
  grouped: col.internal(integer('grouped', { mode: 'boolean' }).notNull().default(false)),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    check('core_vocabularies_ordering', sql`${t.ordering} IN ('manual', 'alphabetical')`),
    check('core_vocabularies_term_class', sql`${t.termClass} IN ('public', 'internal')`),
  ],
})

/** A heading within a grouped vocabulary. One level deep; a heading with live terms cannot be removed. */
export const termGroups = defineTable('core_term_groups', {
  id: col.id(),
  vocabularyKey: col.internal(text('vocabulary_key').notNull().references(() => vocabularies.key, { onDelete: 'restrict' })),
  label: col.public(text('label').notNull()),
  // A declared heading's stable code, from its label when it was made (R3-07: a term's kind is its
  // heading's slug, so a picker narrows by it whatever the theatre renames the heading to).
  slug: col.internal(text('slug')),
  sort: col.internal(integer('sort').notNull().default(0)),
}, {
  id: 'tgr',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_term_groups_label').on(t.vocabularyKey, sql`lower(${t.label})`),
    index('core_term_groups_order').on(t.vocabularyKey, t.sort),
    check('core_term_groups_label_length', sql`length(${t.label}) BETWEEN 1 AND 80`),
  ],
})

/**
 * One option in a vocabulary. A record stores the term's id, never its label, so a rename reaches
 * every record and nothing is rewritten. A term is never deleted once anything points at it: every
 * reference is restrict. The label, description and icon take their class from the vocabulary's
 * term_class, which is public or internal and never personal, so they are declared public here.
 */
export const terms = defineTable('core_terms', {
  id: col.id(),
  vocabularyKey: col.internal(text('vocabulary_key').notNull().references(() => vocabularies.key, { onDelete: 'restrict' })),
  slug: col.public(text('slug').notNull()),
  label: col.public(text('label').notNull()),
  description: col.public(text('description')),
  icon: col.public(text('icon')),
  sort: col.internal(integer('sort').notNull().default(0)),
  seeded: col.internal(integer('seeded', { mode: 'boolean' }).notNull().default(false)),
  retiredAt: col.timestamp('retired_at'),
  mergedIntoId: col.ref('core_terms', { nullable: true }),
  // The heading a term sits under, in a grouped vocabulary.
  groupId: col.internal(text('group_id').references(() => termGroups.id, { onDelete: 'restrict' })),
  createdAt: col.createdAt(),
}, {
  id: 'trm',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_terms_slug').on(t.vocabularyKey, t.slug),
    // Two live terms in one vocabulary cannot share a label, ignoring case; a retired one can.
    uniqueIndex('core_terms_live_label').on(t.vocabularyKey, sql`lower(${t.label})`).where(sql`${t.retiredAt} IS NULL`),
    index('core_terms_order').on(t.vocabularyKey, t.sort),
    index('core_terms_group').on(t.groupId),
    check('core_terms_label_length', sql`length(${t.label}) BETWEEN 1 AND 80`),
    check('core_terms_description_length', sql`${t.description} IS NULL OR length(${t.description}) <= 300`),
  ],
})

const SIDES = sql`('audience', 'members')`

/**
 * One thing the system has to tell one person (group 5). Its deliveries are the attempts, one for
 * each channel. The payload is what the wording is filled with; it is cleared once every delivery
 * is finished, and the row outlives it so the log can say what was sent without holding it.
 */
export const notifications = defineTable('core_notifications', {
  id: col.id(),
  typeKey: col.internal(text('type_key').notNull()),
  side: col.internal(text('side').notNull()),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  // Only for a send to an address with no account yet (notifyAddress, once it joins the pipeline).
  address: col.email('address'),
  locale: col.internal(text('locale').notNull()),
  subjectType: col.internal(text('subject_type')),
  subjectId: col.internal(text('subject_id')),
  dedupeKey: col.internal(text('dedupe_key')),
  coalesceKey: col.internal(text('coalesce_key')),
  payload: col.personal(text('payload', { mode: 'json' }), { erase: 'clear' }),
  // A type's sealed variables, such as a link that signs someone in: encrypted with the core key,
  // never in payload, and cleared in the unit that finishes the email delivery.
  sealedVariables: col.personal(text('sealed_variables'), { encrypted: true, erase: 'clear' }),
  actorId: col.account('actor_id', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'ntf',
  realm: { column: 'side' },
  subject: { account: 'account_id', unlinked: 'staff' },
  retention: 'core.delivery.log-retention',
  extra: t => [
    // The key leaves the account out so it matches across a merge (R-34); the index keeps one per
    // account, and one for all sends to bare addresses (notifyAddress's keys are its own).
    uniqueIndex('core_notifications_dedupe_account').on(t.dedupeKey, sql`coalesce(${t.accountId}, '')`).where(sql`${t.dedupeKey} IS NOT NULL`),
    index('core_notifications_subject').on(t.subjectType, t.subjectId),
    index('core_notifications_account').on(t.accountId, t.createdAt),
    check('core_notifications_side', sql`${t.side} IN ${SIDES}`),
    check('core_notifications_recipient', sql`(${t.accountId} IS NULL) <> (${t.address} IS NULL) OR ${t.payload} IS NULL`),
  ],
})

/** One attempt to tell one notification's recipient by one channel. */
export const deliveries = defineTable('core_notification_deliveries', {
  id: col.id(),
  notificationId: col.internal(text('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' })),
  side: col.internal(text('side').notNull()),
  channel: col.internal(text('channel').notNull()),
  state: col.internal(text('state').notNull()),
  reason: col.internal(text('reason')),
  templateId: col.internal(text('template_id')),
  senderKey: col.internal(text('sender_key').references(() => senderIdentities.key, { onDelete: 'restrict' })),
  providerRef: col.internal(text('provider_ref')),
  attempts: col.internal(integer('attempts').notNull().default(0)),
  nextAttemptAt: col.timestamp('next_attempt_at'),
  lastError: col.internal(text('last_error')),
  rolledIntoId: col.internal(text('rolled_into_id').references(() => notifications.id, { onDelete: 'set null' })),
  sentAt: col.timestamp('sent_at'),
  createdAt: col.createdAt(),
}, {
  id: 'ndl',
  realm: { column: 'side' },
  subject: { via: 'notification_id' },
  extra: t => [
    uniqueIndex('core_notification_deliveries_channel').on(t.notificationId, t.channel),
    index('core_notification_deliveries_due').on(t.state, t.nextAttemptAt),
    index('core_notification_deliveries_provider').on(t.providerRef),
    check('core_notification_deliveries_side', sql`${t.side} IN ${SIDES}`),
    check('core_notification_deliveries_state', sql`${t.state} IN ('queued', 'held', 'sending', 'sent', 'retrying', 'failed', 'suppressed', 'skipped', 'bounced', 'complained')`),
  ],
})

/** A message in a person's inbox on one side. The unread count reads the account index. */
export const inboxItems = defineTable('core_inbox_items', {
  id: col.id(),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias' }),
  deliveryId: col.internal(text('delivery_id').references(() => deliveries.id, { onDelete: 'set null' })),
  side: col.internal(text('side').notNull()),
  title: col.personal(text('title').notNull()),
  body: col.personal(text('body')),
  link: col.internal(text('link')),
  readAt: col.timestamp('read_at'),
  archivedAt: col.timestamp('archived_at'),
  expiresAt: col.timestamp('expires_at').notNull(),
  createdAt: col.createdAt(),
}, {
  id: 'inb',
  realm: { column: 'side' },
  retention: 'core.delivery.inbox-retention',
  onErasure: 'delete-row',
  extra: t => [
    index('core_inbox_items_account').on(t.accountId, t.side, t.archivedAt, t.createdAt),
    check('core_inbox_items_side', sql`${t.side} IN ${SIDES}`),
    check('core_inbox_items_title', sql`length(${t.title}) BETWEEN 1 AND 120`),
    check('core_inbox_items_body', sql`${t.body} IS NULL OR length(${t.body}) <= 500`),
  ],
})

/** A person's choice for one topic and channel. No row means the type's default. */
export const notificationPreferences = defineTable('core_notification_preferences', {
  accountId: col.account('account_id', { role: 'subject', onMerge: 'handler' }),
  topicKey: col.internal(text('topic_key').notNull()),
  channel: col.internal(text('channel').notNull()),
  side: col.internal(text('side').notNull()),
  enabled: col.personal(integer('enabled', { mode: 'boolean' }).notNull()),
  digest: col.personal(text('digest').notNull().default('immediate')),
}, {
  realm: { column: 'side' },
  onErasure: 'delete-row',
  extra: t => [
    primaryKey({ columns: [t.accountId, t.topicKey, t.channel] }),
    check('core_notification_preferences_side', sql`${t.side} IN ${SIDES}`),
    check('core_notification_preferences_digest', sql`${t.digest} IN ('immediate', 'daily', 'weekly')`),
  ],
})

/**
 * Addresses no email goes to, whoever asks, kept as a keyed hash of the lower-cased address so the
 * list names nobody and still stops mail to an erased person.
 */
export const emailSuppressions = defineTable('core_email_suppressions', {
  addressHash: col.internal(text('address_hash').primaryKey()),
  reason: col.internal(text('reason').notNull()),
  createdAt: col.createdAt(),
  liftedAt: col.timestamp('lifted_at'),
  liftedBy: col.account('lifted_by', { role: 'actor', onMerge: 'alias', nullable: true }),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [check('core_email_suppressions_reason', sql`${t.reason} IN ('hard_bounce', 'complaint', 'manual')`)],
})

/** A dated label that groups productions (part 2, group 1). A season may be one day long. */
export const seasons = defineTable('core_seasons', {
  id: col.id(),
  slug: col.public(text('slug').notNull()),
  name: col.public(text('name').notNull()),
  startsOn: col.public(text('starts_on').notNull()),
  endsOn: col.public(text('ends_on').notNull()),
  summary: col.public(text('summary')),
  state: col.internal(text('state').notNull().default('draft')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
}, {
  id: 'sea',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_seasons_slug').on(t.slug),
    uniqueIndex('core_seasons_name').on(sql`lower(${t.name})`),
    check('core_seasons_state', sql`${t.state} IN ('draft', 'published', 'archived')`),
    check('core_seasons_dates', sql`${t.endsOn} >= ${t.startsOn}`),
  ],
})

/**
 * Anything the theatre puts in front of people: its own show, a visiting company's, a hire, or an
 * event. first_starts_at and last_ends_at are copies kept in step by every performance write.
 */
export const productions = defineTable('core_productions', {
  id: col.id(),
  slug: col.public(text('slug').notNull()),
  title: col.public(text('title').notNull()),
  subtitle: col.public(text('subtitle')),
  summary: col.public(text('summary')),
  description: col.public(text('description')),
  kind: col.internal(text('kind').notNull()),
  // col.ref, so the vocabulary screen counts the use and refuses to delete a term in use.
  categoryTermId: col.ref('core_terms', { nullable: true }),
  seasonId: col.public(text('season_id').references(() => seasons.id, { onDelete: 'set null' })),
  companyName: col.public(text('company_name')),
  // Who it is for: a minimum age, as a recommendation or, when age_restricted, as a rule.
  ageMin: col.public(integer('age_min')),
  ageRestricted: col.public(integer('age_restricted', { mode: 'boolean' }).notNull().default(false)),
  effectsConfirmedNone: col.public(integer('effects_confirmed_none', { mode: 'boolean' }).notNull().default(false)),
  advisoriesConfirmedNone: col.public(integer('advisories_confirmed_none', { mode: 'boolean' }).notNull().default(false)),
  contentNote: col.public(text('content_note')),
  runningMinutes: col.public(integer('running_minutes')),
  intervalCount: col.public(integer('interval_count').notNull().default(0)),
  // Each interval's length in minutes, the doors' lead in minutes and the house, over the space's and
  // the theatre's; null takes theirs. Bounded by the route's input: a CHECK would rebuild the table.
  intervalMinutes: col.public(integer('interval_minutes')),
  doorsBeforeMinutes: col.internal(integer('doors_before_minutes')),
  capacity: col.internal(integer('capacity')),
  // The space it usually plays in: what adding a run or a performance offers first. Each date keeps its own.
  usualSpaceId: col.internal(text('usual_space_id').references(() => spaces.id, { onDelete: 'set null' })),
  externalBookingUrl: col.public(text('external_booking_url')),
  // When latecomers are let in (any-time, suitable-point, interval, not-admitted); null takes the
  // theatre's usual practice (core.visiting.latecomers). Bounded by the route's input.
  latecomers: col.public(text('latecomers')),
  creditsPublic: col.internal(integer('credits_public', { mode: 'boolean' }).notNull()),
  state: col.internal(text('state').notNull().default('draft')),
  cancelReasonTermId: col.ref('core_terms', { nullable: true }),
  listed: col.internal(integer('listed', { mode: 'boolean' }).notNull().default(true)),
  publishedAt: col.timestamp('published_at'),
  firstStartsAt: col.public(integer('first_starts_at')),
  lastEndsAt: col.public(integer('last_ends_at')),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'prd',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_productions_slug').on(t.slug),
    index('core_productions_listing').on(t.state, t.lastEndsAt),
    index('core_productions_season').on(t.seasonId),
    index('core_productions_category').on(t.categoryTermId),
    check('core_productions_state', sql`${t.state} IN ('draft', 'published', 'withdrawn', 'cancelled')`),
    check('core_productions_kind', sql`${t.kind} IN ('own', 'visiting', 'hire', 'event')`),
    check('core_productions_title', sql`length(${t.title}) BETWEEN 1 AND 200`),
    check('core_productions_summary', sql`${t.summary} IS NULL OR length(${t.summary}) <= 300`),
    check('core_productions_age_min', sql`${t.ageMin} IS NULL OR ${t.ageMin} BETWEEN 0 AND 21`),
    check('core_productions_age_restricted', sql`${t.ageRestricted} = 0 OR ${t.ageMin} IS NOT NULL`),
    check('core_productions_running', sql`${t.runningMinutes} IS NULL OR ${t.runningMinutes} > 0`),
    check('core_productions_intervals', sql`${t.intervalCount} >= 0`),
    check('core_productions_booking_url', sql`${t.externalBookingUrl} IS NULL OR ${t.externalBookingUrl} LIKE 'https://_%'`),
    check('core_productions_cancel_reason', sql`(${t.state} = 'cancelled') = (${t.cancelReasonTermId} IS NOT NULL)`),
  ],
})

/** Every slug a published production has had, so an old link redirects for ever. */
export const productionSlugs = defineTable('core_production_slugs', {
  slug: col.public(text('slug').primaryKey()),
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' })),
  retiredAt: col.internal(integer('retired_at').notNull()),
}, { realm: 'operational', subject: 'none', appendOnly: true })

/**
 * The content warnings a production carries, from the core.advisory vocabulary: a level (how much
 * of the topic the show holds) and a short detail. Their order is derived, never stored.
 */
export const productionAdvisories = defineTable('core_production_advisories', {
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' })),
  termId: col.ref('core_terms'),
  level: col.public(text('level').notNull()),
  // Set only by the migration for a row that had no level: the page shows no level word until a person grades it.
  levelAssumed: col.internal(integer('level_assumed', { mode: 'boolean' }).notNull().default(false)),
  detail: col.public(text('detail')),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.productionId, t.termId] }),
    check('core_production_advisories_detail', sql`${t.detail} IS NULL OR length(${t.detail}) <= 300`),
    check('core_production_advisories_level', sql`${t.level} IN ('mentioned', 'discussed', 'depicted')`),
  ],
})

/** The staging effects a production uses (strobe, haze, loud noises), from core.staging-effect. Ungraded, always shown. */
export const productionEffects = defineTable('core_production_effects', {
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' })),
  termId: col.ref('core_terms'),
  detail: col.public(text('detail')),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.productionId, t.termId] }),
    check('core_production_effects_detail', sql`${t.detail} IS NULL OR length(${t.detail}) <= 300`),
  ],
})

/** A staging effect a production uses but one performance does not ("not used at this performance"). The term must be one of the production's effects. */
export const performanceEffectExceptions = defineTable('core_performance_effect_exceptions', {
  performanceId: col.internal(text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' })),
  termId: col.ref('core_terms'),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.performanceId, t.termId] }),
  ],
})

/**
 * Who made the show (C-09): a printed name and a role in a section, linked to an account or not. A
 * credit with no account is a historical or outside credit, found for a data request by staff
 * searching the printed name. The linked person may change the visibility of their own.
 */
export const productionCredits = defineTable('core_production_credits', {
  id: col.id(),
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' })),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  creditedName: col.public(text('credited_name').notNull()),
  role: col.public(text('role').notNull()),
  sectionTermId: col.ref('core_terms'),
  visibility: col.internal(text('visibility').notNull().default('public')),
  sort: col.internal(integer('sort').notNull().default(0)),
}, {
  id: 'crd',
  realm: 'members',
  subject: { account: 'account_id', unlinked: 'staff' },
  extra: t => [
    index('core_production_credits_order').on(t.productionId, t.sectionTermId, t.sort),
    index('core_production_credits_account').on(t.accountId),
    check('core_production_credits_visibility', sql`${t.visibility} IN ('public', 'members', 'hidden')`),
    check('core_production_credits_name', sql`length(${t.creditedName}) BETWEEN 1 AND 120`),
    check('core_production_credits_role', sql`length(${t.role}) BETWEEN 1 AND 120`),
  ],
})

/**
 * A building or site (part 2, group 2). A venue the theatre uses but does not run (a hired hall) is
 * the same record with managed false. A venue is never a flagged room.
 */
export const venues = defineTable('core_venues', {
  id: col.id(),
  slug: col.public(text('slug').notNull().unique()),
  name: col.public(text('name').notNull()),
  addressLines: col.public(text('address_lines')),
  locality: col.public(text('locality')),
  postcode: col.public(text('postcode')),
  country: col.public(text('country')),
  latitude: col.public(real('latitude')),
  longitude: col.public(real('longitude')),
  description: col.public(text('description')),
  accessInfo: col.public(text('access_info')),
  gettingHere: col.public(text('getting_here')),
  state: col.internal(text('state').notNull().default('active')),
  createdAt: col.createdAt(),
}, {
  id: 'ven',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_venues_name').on(sql`lower(${t.name})`),
    check('core_venues_state', sql`${t.state} IN ('active', 'archived')`),
    check('core_venues_position', sql`(${t.latitude} IS NULL) = (${t.longitude} IS NULL)`),
    check('core_venues_country', sql`${t.country} IS NULL OR length(${t.country}) = 2`),
  ],
})

/**
 * A room or area inside a venue, where performances happen. (id, venue_id) is unique so a
 * performance can reference the pair and never disagree with its venue.
 */
export const spaces = defineTable('core_spaces', {
  id: col.id(),
  venueId: col.internal(text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' })),
  slug: col.public(text('slug').notNull()),
  name: col.public(text('name').notNull()),
  // col.ref, so the vocabulary screen counts the use and refuses to delete a term in use.
  kindTermId: col.ref('core_terms'),
  defaultCapacity: col.internal(integer('default_capacity')),
  performable: col.internal(integer('performable', { mode: 'boolean' }).notNull().default(true)),
  exclusive: col.internal(integer('exclusive', { mode: 'boolean' }).notNull().default(true)),
  description: col.public(text('description')),
  accessInfo: col.public(text('access_info')),
  // Whether the theatre runs this space (R-36): a theatre may run some rooms in a building another
  // body manages. Core treats managed and unmanaged spaces alike; other modules may ask.
  managed: col.internal(integer('managed', { mode: 'boolean' }).notNull().default(true)),
  // A short public note for finding the space, shown under the venue's directions. At most 200
  // characters, bounded by the route's input: a CHECK added now would rebuild the table.
  findingIt: col.public(text('finding_it')),
  // How many minutes before the start this space's doors open, over the theatre's setting; null
  // takes the setting. Bounded by the route's input, like finding_it.
  doorsBeforeMinutes: col.internal(integer('doors_before_minutes')),
  // The run preset the Add a run window starts from here, over core.programme.run-preset. No foreign
  // key (it would rebuild the table): deleting a preset clears it in the same unit.
  runPresetId: col.internal(text('run_preset_id')),
  state: col.internal(text('state').notNull().default('active')),
  sort: col.internal(integer('sort').notNull().default(0)),
  createdAt: col.createdAt(),
}, {
  id: 'spc',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_spaces_venue_pair').on(t.id, t.venueId),
    uniqueIndex('core_spaces_slug').on(t.venueId, t.slug),
    uniqueIndex('core_spaces_name').on(t.venueId, sql`lower(${t.name})`),
    check('core_spaces_state', sql`${t.state} IN ('active', 'archived')`),
    check('core_spaces_capacity', sql`${t.defaultCapacity} IS NULL OR ${t.defaultCapacity} > 0`),
  ],
})

/**
 * The access features a venue or one of its spaces has, from the core.place-access vocabulary.
 * A null space means the whole venue. A space shows its venue's features and its own.
 */
export const placeAccess = defineTable('core_place_access', {
  id: col.id(),
  venueId: col.internal(text('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' })),
  spaceId: col.internal(text('space_id')),
  termId: col.ref('core_terms'),
  note: col.public(text('note')),
  sort: col.internal(integer('sort').notNull().default(0)),
}, {
  id: 'pla',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    // The space must belong to the venue: the pair references core_spaces (id, venue_id).
    foreignKey({ columns: [t.spaceId, t.venueId], foreignColumns: [spaces.id, spaces.venueId] }).onDelete('cascade'),
    uniqueIndex('core_place_access_term').on(t.venueId, sql`coalesce(${t.spaceId}, '')`, t.termId),
    check('core_place_access_note', sql`${t.note} IS NULL OR length(${t.note}) <= 200`),
  ],
})

/**
 * Times when the whole theatre (no venue), a venue (no space) or one space is shut, and the
 * public holidays brought in from a feed (C-18, C-19). A blocking closure refuses a performance
 * scheduled inside it; a public holiday only warns.
 */
export const closures = defineTable('core_closures', {
  id: col.id(),
  venueId: col.internal(text('venue_id').references(() => venues.id, { onDelete: 'cascade' })),
  spaceId: col.internal(text('space_id')),
  kind: col.internal(text('kind').notNull()),
  title: col.public(text('title').notNull()),
  startsAt: col.public(integer('starts_at').notNull()),
  endsAt: col.public(integer('ends_at').notNull()),
  allDay: col.public(integer('all_day', { mode: 'boolean' }).notNull().default(false)),
  blocksPerformances: col.internal(integer('blocks_performances', { mode: 'boolean' }).notNull()),
  source: col.internal(text('source').notNull()),
  feedRef: col.internal(text('feed_ref')),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
}, {
  id: 'clo',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    // The space must belong to the venue: the pair references core_spaces (id, venue_id).
    foreignKey({ columns: [t.spaceId, t.venueId], foreignColumns: [spaces.id, spaces.venueId] }).onDelete('cascade'),
    index('core_closures_time').on(t.startsAt, t.endsAt),
    index('core_closures_venue').on(t.venueId, t.startsAt),
    uniqueIndex('core_closures_feed_ref').on(t.feedRef).where(sql`${t.feedRef} IS NOT NULL`),
    check('core_closures_kind', sql`${t.kind} IN ('closure', 'public_holiday')`),
    check('core_closures_source', sql`${t.source} IN ('manual', 'feed')`),
    check('core_closures_scope', sql`${t.spaceId} IS NULL OR ${t.venueId} IS NOT NULL`),
    check('core_closures_period', sql`${t.endsAt} > ${t.startsAt}`),
    check('core_closures_title', sql`length(${t.title}) BETWEEN 1 AND 120`),
  ],
})

/**
 * One occasion on which a production happens (part 2, group 1). Everything record-like in every
 * other module keys to a row here, never to a date or a room.
 */
/**
 * A run of performances too long for one unit (C-04), created by the core.create-run job in chunks.
 * `items` holds the performances still to make, as the person accepted them from the preview;
 * `done` counts how many of them the chunks have dealt with, so a repeated chunk does nothing.
 */
/**
 * A run preset: a named pattern of start times, each with the days of the week it runs on, that the
 * Add a run window starts from. `slots` is JSON, [{ "days": [2, 3], "times": ["19:30"] }, ...].
 */
export const runPresets = defineTable('core_run_presets', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  slots: col.internal(text('slots').notNull()),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.internal(integer('updated_at').notNull()),
}, {
  id: 'rps',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_run_presets_name').on(sql`lower(${t.name})`),
    check('core_run_presets_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
  ],
})

export const performanceRuns = defineTable('core_performance_runs', {
  id: col.id(),
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'cascade' })),
  venueId: col.internal(text('venue_id').notNull()),
  spaceId: col.internal(text('space_id').notNull()),
  scheduled: col.internal(integer('scheduled', { mode: 'boolean' }).notNull()),
  capacity: col.internal(integer('capacity')),
  intervalCount: col.internal(integer('interval_count')),
  intervalMinutes: col.internal(integer('interval_minutes')),
  label: col.internal(text('label')),
  externalBookingUrl: col.internal(text('external_booking_url')),
  items: col.internal(text('items').notNull()),
  total: col.internal(integer('total').notNull()),
  done: col.internal(integer('done').notNull().default(0)),
  state: col.internal(text('state').notNull().default('running')),
  stopReason: col.internal(text('stop_reason')),
  /** The pattern the run was made from (dates, start times, space, running time), as JSON, so it can be edited. */
  pattern: col.internal(text('pattern')),
  createdAt: col.createdAt(),
  updatedAt: col.internal(integer('updated_at').notNull()),
}, {
  id: 'run',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('core_performance_runs_production').on(t.productionId, t.createdAt),
    check('core_performance_runs_state', sql`${t.state} IN ('running', 'stopped', 'done', 'removing', 'removed')`),
    check('core_performance_runs_done', sql`${t.done} BETWEEN 0 AND ${t.total}`),
    check('core_performance_runs_stop', sql`${t.stopReason} IS NULL OR length(${t.stopReason}) <= 300`),
  ],
})

export const performances = defineTable('core_performances', {
  id: col.id(),
  productionId: col.internal(text('production_id').notNull().references(() => productions.id, { onDelete: 'restrict' })),
  venueId: col.public(text('venue_id').notNull().references(() => venues.id, { onDelete: 'restrict' })),
  spaceId: col.public(text('space_id').notNull()),
  startsAt: col.public(integer('starts_at').notNull()),
  doorsAt: col.public(integer('doors_at')),
  endsAt: col.public(integer('ends_at').notNull()),
  operatingDay: col.internal(text('operating_day').notNull()),
  intervalCount: col.public(integer('interval_count')),
  // Each interval's length in minutes; null takes the production's, then the theatre's.
  intervalMinutes: col.public(integer('interval_minutes')),
  capacity: col.internal(integer('capacity')),
  label: col.public(text('label')),
  externalBookingUrl: col.public(text('external_booking_url')),
  state: col.public(text('state').notNull().default('draft')),
  cancelledAt: col.public(integer('cancelled_at')),
  cancelReasonTermId: col.ref('core_terms', { nullable: true }),
  cancelNote: col.public(text('cancel_note')),
  // Set with state completed, so the operating-day recalculation leaves finished nights alone.
  completedAt: col.internal(integer('completed_at')),
  // The long run that made it, so a chunk repeated makes nothing twice and an unfinished run can be removed.
  runId: col.internal(text('run_id').references(() => performanceRuns.id, { onDelete: 'set null' })),
  // Timed, or drop-in: open from starts_at until ends_at, no doors or intervals (C-62, DI1 to DI6).
  // Bounded by the route's input and the service, not a CHECK, so adding it rebuilds nothing.
  shape: col.public(text('shape').notNull().default('timed')),
  createdAt: col.createdAt(),
}, {
  id: 'perf',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    // The venue can never disagree with the space: the pair references core_spaces (id, venue_id).
    foreignKey({ columns: [t.spaceId, t.venueId], foreignColumns: [spaces.id, spaces.venueId] }).onDelete('restrict'),
    index('core_performances_starts').on(t.startsAt),
    index('core_performances_day').on(t.operatingDay),
    index('core_performances_production').on(t.productionId, t.startsAt),
    index('core_performances_venue').on(t.venueId, t.startsAt),
    index('core_performances_space').on(t.spaceId, t.startsAt),
    uniqueIndex('core_performances_run').on(t.runId, t.startsAt).where(sql`${t.runId} IS NOT NULL`),
    check('core_performances_state', sql`${t.state} IN ('draft', 'scheduled', 'cancelled', 'completed')`),
    check('core_performances_period', sql`${t.endsAt} > ${t.startsAt}`),
    check('core_performances_doors', sql`${t.doorsAt} IS NULL OR ${t.doorsAt} <= ${t.startsAt}`),
    check('core_performances_interval', sql`${t.intervalCount} IS NULL OR ${t.intervalCount} >= 0`),
    check('core_performances_capacity', sql`${t.capacity} IS NULL OR ${t.capacity} >= 0`),
    check('core_performances_label', sql`${t.label} IS NULL OR length(${t.label}) BETWEEN 1 AND 40`),
    check('core_performances_booking_url', sql`${t.externalBookingUrl} IS NULL OR ${t.externalBookingUrl} LIKE 'https://_%'`),
    check('core_performances_cancel', sql`(${t.state} = 'cancelled') = (${t.cancelledAt} IS NOT NULL AND ${t.cancelReasonTermId} IS NOT NULL)`),
    check('core_performances_cancel_note', sql`${t.cancelNote} IS NULL OR length(${t.cancelNote}) <= 200`),
    check('core_performances_completed', sql`(${t.state} = 'completed') = (${t.completedAt} IS NOT NULL)`),
  ],
})

/** What one performance offers (captioned, signed, relaxed and so on), from core.access-feature. */
export const performanceAccess = defineTable('core_performance_access', {
  performanceId: col.internal(text('performance_id').notNull().references(() => performances.id, { onDelete: 'cascade' })),
  termId: col.ref('core_terms'),
  detail: col.public(text('detail')),
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    primaryKey({ columns: [t.performanceId, t.termId] }),
    check('core_performance_access_detail', sql`${t.detail} IS NULL OR length(${t.detail}) <= 200`),
  ],
})

/**
 * Email outcomes the queue gave up on, unread or unmatched (core part 4), for the health screen. It
 * holds no text from the message: the queue's own id, one of six known types or null, and why. Kept
 * 30 days, fixed; the delivery sweep removes older rows.
 */
export const emailEventsSetAside = defineTable('core_email_events_set_aside', {
  queueMessageId: col.internal(text('queue_message_id').primaryKey()),
  eventType: col.internal(text('event_type')),
  reason: col.internal(text('reason').notNull()),
  setAsideAt: col.internal(integer('set_aside_at').notNull()),
}, {
  realm: 'system',
  subject: 'none',
  retention: { fixed: '30d' },
  extra: t => [
    index('core_email_events_set_aside_at').on(t.setAsideAt),
    check('core_email_events_set_aside_type', sql`${t.eventType} IS NULL OR ${t.eventType} IN ('delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained')`),
    check('core_email_events_set_aside_reason', sql`${t.reason} IN ('unreadable', 'unmatched')`),
  ],
})

/**
 * Webhooks (group 6; C-49 to C-51, question 9): an outside address that is sent the theatre's
 * events. The address and the secret are sealed with the core key and never reach a browser.
 * `failing` is a pause the system made after too many failures in a row; `paused` is a person's.
 */
export const webhooks = defineTable('core_webhooks', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  format: col.internal(text('format').notNull()),
  url: col.internal(text('url').notNull(), { encrypted: true }),
  // The address's host, kept apart so the console can show where a webhook goes without opening the seal.
  urlHint: col.internal(text('url_hint').notNull()),
  secret: col.internal(text('secret'), { encrypted: true }),
  events: col.internal(text('events', { mode: 'json' }).notNull().$type<string[]>()),
  state: col.internal(text('state').notNull().default('active')),
  consecutiveFailures: col.internal(integer('consecutive_failures').notNull().default(0)),
  lastSuccessAt: col.timestamp('last_success_at'),
  createdBy: col.account('created_by', { role: 'actor', onMerge: 'alias', nullable: true }),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'whk',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_webhooks_name').on(sql`lower(${t.name})`),
    check('core_webhooks_name_length', sql`length(${t.name}) BETWEEN 1 AND 60`),
    check('core_webhooks_format', sql`${t.format} IN ('json', 'discord', 'slack')`),
    check('core_webhooks_secret', sql`${t.format} <> 'json' OR ${t.secret} IS NOT NULL`),
    check('core_webhooks_state', sql`${t.state} IN ('active', 'paused', 'failing')`),
  ],
})

/**
 * One event sent, or to be sent, to one webhook. The body is not kept: it is rebuilt from the event
 * at each attempt, so no personal data can rest here. The id goes with each attempt, the same on a
 * retry, so a receiver can ignore a repeat.
 */
export const webhookDeliveries = defineTable('core_webhook_deliveries', {
  id: col.id(),
  webhookId: col.internal(text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' })),
  eventId: col.internal(text('event_id').notNull()),
  eventName: col.internal(text('event_name').notNull()),
  state: col.internal(text('state').notNull()),
  attempts: col.internal(integer('attempts').notNull().default(0)),
  nextAttemptAt: col.timestamp('next_attempt_at'),
  responseStatus: col.internal(integer('response_status')),
  lastError: col.internal(text('last_error')),
  createdAt: col.createdAt(),
  sentAt: col.timestamp('sent_at'),
}, {
  id: 'whd',
  realm: 'operational',
  subject: 'none',
  retention: 'core.webhooks.log-retention',
  extra: t => [
    uniqueIndex('core_webhook_deliveries_event').on(t.webhookId, t.eventId),
    index('core_webhook_deliveries_due').on(t.state, t.nextAttemptAt),
    index('core_webhook_deliveries_log').on(t.webhookId, t.createdAt),
    check('core_webhook_deliveries_state', sql`${t.state} IN ('queued', 'sending', 'sent', 'retrying', 'failed')`),
  ],
})

/**
 * A policy as it read at one time (/policies/<id>): the whole text as plain Markdown, with every
 * setting's value filled in. A row is written the first time a policy is found to read differently,
 * whether its wording, a setting it quotes or a module changed. What a person agreed to (an order's
 * terms) points at a row here, so the words they saw can always be shown again. Never changed.
 */
export const policyVersions = defineTable('core_policy_versions', {
  id: col.id(),
  policy: col.internal(text('policy').notNull()),
  // Counts from 1 within a policy, in the order the versions were first seen.
  number: col.internal(integer('number').notNull()),
  hash: col.internal(text('hash').notNull()),
  title: col.internal(text('title').notNull()),
  body: col.internal(text('body').notNull()),
  createdAt: col.timestamp('created_at').notNull(),
}, {
  id: 'pvn',
  realm: 'system',
  subject: 'none',
  extra: t => [
    uniqueIndex('core_policy_versions_number').on(t.policy, t.number),
    uniqueIndex('core_policy_versions_hash').on(t.policy, t.hash),
  ],
})

export const tables = { policyVersions, webhooks, webhookDeliveries, venues, spaces, placeAccess, closures, seasons, productions, productionSlugs, productionAdvisories, productionEffects, termGroups, productionCredits, runPresets, performanceRuns, performances, performanceAccess, performanceEffectExceptions, files, senderIdentities, notificationRouting, vocabularies, terms, notifications, deliveries, inboxItems, notificationPreferences, emailSuppressions, emailEventsSetAside }
