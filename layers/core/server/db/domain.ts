// The core domain's tables (workstream 3, part 2): stored files, who mail comes from, and the
// vocabularies every module shares. The rest of the domain's tables arrive with the later slices.
import { check, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
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
  slug: col.internal(text('slug').notNull()),
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

export const tables = { files, senderIdentities, notificationRouting, vocabularies, terms }
