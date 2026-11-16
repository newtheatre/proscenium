// The core domain's tables for roadmap phase 1 (workstream 3, part 2): stored files, and who mail
// comes from. The rest of the domain's tables arrive with phase 2.
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

export const tables = { files, senderIdentities, notificationRouting }
