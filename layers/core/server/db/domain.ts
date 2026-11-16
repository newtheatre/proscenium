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
  uploadedBy: col.account('uploaded_by', { role: 'subject', onMerge: 'move', nullable: true }),
  createdAt: col.createdAt(),
  readyAt: col.timestamp('ready_at'),
  attachedAt: col.timestamp('attached_at'),
  deletedAt: col.timestamp('deleted_at'),
  purgeAfter: col.timestamp('purge_after'),
}, {
  id: 'fil',
  random: true,
  realm: 'operational',
  subject: { account: 'uploaded_by', unlinked: 'staff' },
  retention: 'core.files.deleted-retention',
  extra: t => [
    index('core_files_owner').on(t.ownerType, t.ownerId, t.slot, t.sort),
    index('core_files_purge').on(t.state, t.purgeAfter),
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
}, {
  realm: 'operational',
  subject: 'none',
  extra: t => [
    check('core_vocabularies_ordering', sql`${t.ordering} IN ('manual', 'alphabetical')`),
    check('core_vocabularies_term_class', sql`${t.termClass} IN ('public', 'internal')`),
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
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move', nullable: true }),
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
  retention: 'core.notifications.log-retention',
  extra: t => [
    uniqueIndex('core_notifications_dedupe').on(t.dedupeKey).where(sql`${t.dedupeKey} IS NOT NULL`),
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
  accountId: col.account('account_id', { role: 'subject', onMerge: 'move' }),
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
  retention: 'core.notifications.inbox-retention',
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

/**
 * A building or site (part 2, group 2). A venue the theatre uses but does not run (a hired hall) is
 * the same record with managed false. A venue is never a flagged room.
 */
export const venues = defineTable('core_venues', {
  id: col.id(),
  slug: col.public(text('slug').notNull().unique()),
  name: col.public(text('name').notNull()),
  managed: col.internal(integer('managed', { mode: 'boolean' }).notNull().default(true)),
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

export const tables = { venues, spaces, placeAccess, files, senderIdentities, notificationRouting, vocabularies, terms, notifications, deliveries, inboxItems, notificationPreferences, emailSuppressions }
