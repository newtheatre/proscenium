// Awards: two tables. An award type is something the theatre can give ("Fellowship",
// "Commendation"); an award is one person holding one type. An award has no end date: it is current
// until it is revoked. A person is an account id where one is known; a historical award may carry
// only the printed name.
import { integer, text, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const TYPE_STATES = ['active', 'archived'] as const
export const VISIBILITIES = ['public', 'members', 'hidden'] as const
export const AWARD_STATES = ['current', 'revoked'] as const
export const SOURCES = ['direct', 'nomination', 'import'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** What a theatre can give. */
export const types = defineTable('awards_types', {
  id: col.id(),
  key: col.public(text('key').notNull()),
  name: col.public(text('name').notNull()),
  summary: col.public(text('summary')),
  // Whether holding one meets the award-holder ticket requirement (a Fellow's price).
  givesTicketBenefit: col.internal(integer('gives_ticket_benefit', { mode: 'boolean' }).notNull().default(false)),
  // A fellowship is held once; a person may earn several commendations.
  onePerPerson: col.internal(integer('one_per_person', { mode: 'boolean' }).notNull().default(true)),
  defaultVisibility: col.internal(text('default_visibility', { enum: VISIBILITIES }).notNull().default('public')),
  state: col.internal(text('state', { enum: TYPE_STATES }).notNull().default('active')),
  position: col.internal(integer('position').notNull()),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'awt',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    uniqueIndex('awards_types_key').on(t.key),
    index('awards_types_state').on(t.state, t.position),
    check('awards_types_state_values', sql`${t.state} IN (${inList(TYPE_STATES)})`),
    check('awards_types_visibility', sql`${t.defaultVisibility} IN (${inList(VISIBILITIES)})`),
    check('awards_types_name', sql`length(${t.name}) BETWEEN 1 AND 80`),
  ],
})

/**
 * One person holding one award type. An award with no account is a historical one, found for a data
 * request by staff searching the printed name. The linked person may change the visibility of their own.
 */
export const awards = defineTable('awards_awards', {
  id: col.id(),
  typeId: col.ref('awards_types'),
  accountId: col.account('account_id', { role: 'subject', onMerge: 'alias', nullable: true }),
  // The name as printed on the roll of honour.
  recipientName: col.public(text('recipient_name').notNull(), { erase: 'anonymise' }),
  awardedOn: col.localDate('awarded_on').notNull(),
  // A short line naming what it is for when that is not a show: "Running the workshop programme, 2025".
  awardedFor: col.public(text('awarded_for'), { erase: 'anonymise' }),
  // Published on the roll, so public; about the person, so erasure blanks it.
  citation: col.public(text('citation'), { erase: 'anonymise' }),
  // The show it is for, when it is for one. Core's production, by id.
  productionId: col.ref('core_productions', { nullable: true }),
  // The committee's decision: its date, and a reference such as a minute number.
  decidedOn: col.localDate('decided_on'),
  decisionNote: col.freeText(text('decision_note')),
  source: col.internal(text('source', { enum: SOURCES }).notNull()),
  // The nomination, when there was a form. The form builder's table, by id only until it exists.
  responseId: col.internal(text('response_id')),
  visibility: col.internal(text('visibility', { enum: VISIBILITIES }).notNull()),
  state: col.internal(text('state', { enum: AWARD_STATES }).notNull().default('current')),
  issuedBy: col.account('issued_by', { role: 'actor', nullable: true }),
  revokedAt: col.timestamp('revoked_at'),
  revokedBy: col.account('revoked_by', { role: 'actor', nullable: true }),
  revokeReason: col.freeText(text('revoke_reason')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'awd',
  realm: 'operational',
  subject: { account: 'account_id', unlinked: 'staff' },
  extra: t => [
    index('awards_awards_type').on(t.typeId, t.state, t.awardedOn),
    index('awards_awards_account').on(t.accountId, t.state),
    check('awards_awards_state', sql`${t.state} IN (${inList(AWARD_STATES)})`),
    check('awards_awards_source', sql`${t.source} IN (${inList(SOURCES)})`),
    check('awards_awards_visibility', sql`${t.visibility} IN (${inList(VISIBILITIES)})`),
    check('awards_awards_name', sql`length(${t.recipientName}) BETWEEN 1 AND 120`),
    // Revoked exactly when it says when and why.
    check('awards_awards_revoked', sql`(${t.state} = 'revoked') = (${t.revokedAt} IS NOT NULL)`),
  ],
})

export const tables = { types, awards }
