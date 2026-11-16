// Tables and the data class of every column. `defineTable` refuses a column that is not wrapped in
// one of the `col.*` helpers, so a column with no class cannot be written (F-03).
import { integer, sqliteTableCreator, text, customType } from 'drizzle-orm/sqlite-core'
import type { SQLiteColumnBuilder } from 'drizzle-orm/sqlite-core'
import { DeclarationError } from './refusal'
import { ID_PREFIX, newId } from './ids'
import { nowMs } from './clock'

export type DataClass = 'public' | 'internal' | 'personal' | 'freeText' | 'special' | 'perRow'
export type Erasure = 'keep' | 'anonymise' | 'redact' | 'clear' | 'retain'

export interface ColumnMeta {
  class: DataClass
  erase: Erasure
  /** For `retain`: the duration setting that says how long, and the translation key that says why. */
  until?: string
  reason?: string
  helper: 'id' | 'ref' | 'account' | 'timestamp' | 'localDate' | 'minor' | 'currency' | 'email' | 'wrapped' | 'special'
  ref?: { table: string, nullable: boolean }
  account?: { role: 'subject' | 'actor', onMerge: 'move' | 'alias' | 'handler', nullable: boolean, reason?: string }
  classColumn?: string
  /** Sealed with the core key before it is written (`seal`/`open`). Always so for special. */
  encrypted?: boolean
}

export type Realm = 'audience' | 'members' | 'operational' | 'system' | { column: string }
/**
 * Whom a row is about. `{ account, unlinked: 'staff' }` names a nullable account column and says
 * rows it cannot link are found by staff with the module's redaction ability, by search.
 */
export type Subject = 'none' | { via: string } | { email: string } | { account: string, unlinked: 'staff' } | string | string[]

export interface TableOptions {
  /** The id prefix: two to four lower-case letters, unique across the registry. */
  id?: string
  /** Hide the moment of creation: ids are fully random rather than time-sorted. */
  random?: boolean
  realm: Realm
  subject?: Subject
  /** A duration setting. A scheduled sweep erases or deletes rows older than it. */
  retention?: string
  appendOnly?: boolean
  onErasure?: 'keep-row' | 'delete-row'
  /** Indexes and other table extras, given the built columns. */
  extra?: (table: any) => any[]
}

export interface TableMeta {
  name: string
  options: TableOptions
  /** TypeScript key to SQL column name and class. */
  columns: Record<string, { sql: string, meta: ColumnMeta }>
  /** Account columns whose role is subject, as SQL names. */
  subjects: string[]
}

const META = Symbol.for('proscenium.column')
export const TABLE = Symbol.for('proscenium.table')

/** The placeholder values erasure writes. Append-only triggers allow exactly these. */
/** The longest reason a move column may give: one line. */
const MERGE_REASON_MAX = 200 // not-policy: one line of prose

export const ERASED = { anonymise: 'Former member', redact: '[removed]' } as const

const ALLOWED: Record<DataClass, Erasure[]> = {
  public: ['keep', 'anonymise'],
  internal: ['keep'],
  personal: ['anonymise', 'clear', 'retain'],
  freeText: ['redact', 'clear', 'retain'],
  special: ['clear'],
  perRow: ['keep'],
}
const DEFAULT_ERASE: Record<DataClass, Erasure> = {
  public: 'keep', internal: 'keep', personal: 'anonymise', freeText: 'redact', special: 'clear', perRow: 'keep',
}

type EraseOptions = { erase?: Erasure, until?: string, reason?: string }
type Sealable = { encrypted?: boolean }

function tag<B extends object>(builder: B, meta: Omit<ColumnMeta, 'erase'> & { erase?: Erasure }): B {
  const erase = meta.erase ?? DEFAULT_ERASE[meta.class]
  ;(builder as any)[META] = { ...meta, erase }
  return builder
}

export function columnMeta(builder: unknown): ColumnMeta | undefined {
  return (builder as any)?.[META]
}

const email = customType<{ data: string, driverData: string }>({
  dataType: () => 'text',
  toDriver: value => value.trim().toLowerCase(),
})

/** The column helpers. Identifiers, references, times and money are internal and say so for you. */
export const col = {
  /** The table's id, `<prefix>_<26 characters>`, made by the kit. The prefix is the table's `id` option. */
  id: () => tag(text().primaryKey(), { class: 'internal', helper: 'id' }),
  /** A reference to another table's id. Accepts only that table's prefix in route input. */
  ref: (table: string, options: { nullable?: boolean } = {}) => {
    const builder = text()
    if (!options.nullable) builder.notNull()
    builder.references(() => {
      const target = tables.get(table)
      if (!target) throw new DeclarationError('col.ref', `references "${table}", which no module declares`)
      return (target as any).id
    })
    return tag(builder, { class: 'internal', helper: 'ref', ref: { table, nullable: !!options.nullable } })
  },
  /**
   * A column that refers to an account. `subject`: the row is about this person. `actor`: the
   * person did something to the row. No SQL foreign key is written, so a merge or an erasure never
   * has to rebuild a table. `onMerge` is 'alias' when left out: the column keeps the id it was
   * written with and reads follow the merge through the account scope (inAccountScope). 'move'
   * rewrites it to the survivor and needs a one-line `reason`; 'handler' leaves it to the module's
   * merge handler.
   */
  account: (name: string, options: { role: 'subject' | 'actor', onMerge?: 'move' | 'alias' | 'handler', reason?: string, nullable?: boolean }) => {
    const onMerge = options.onMerge ?? 'alias'
    if (onMerge === 'move' && !(typeof options.reason === 'string' && options.reason.trim() && !options.reason.includes('\n') && options.reason.length <= MERGE_REASON_MAX))
      throw new DeclarationError(`col.account('${name}')`, `onMerge: 'move' needs a one-line reason (at most ${MERGE_REASON_MAX} characters): why the stored id must be the survivor's`)
    if (onMerge !== 'move' && options.reason !== undefined) throw new DeclarationError(`col.account('${name}')`, "a reason is given only for onMerge: 'move'")
    const builder = text(name)
    if (!options.nullable) builder.notNull()
    return tag(builder, { class: 'internal', helper: 'account', account: { role: options.role, onMerge, nullable: !!options.nullable, ...(options.reason ? { reason: options.reason.trim() } : {}) } })
  },
  /** When the row was made, in UTC milliseconds, from the kit's clock. */
  createdAt: () => tag(integer('created_at').notNull().$defaultFn(() => nowMs()), { class: 'internal', helper: 'timestamp' }),
  /** When the row last changed, in UTC milliseconds. */
  updatedAt: () => tag(integer('updated_at').notNull().$defaultFn(() => nowMs()).$onUpdateFn(() => nowMs()), { class: 'internal', helper: 'timestamp' }),
  /** An instant in UTC milliseconds. */
  timestamp: (name: string) => tag(integer(name), { class: 'internal', helper: 'timestamp' }),
  /** A calendar date in the theatre's time zone, YYYY-MM-DD. */
  localDate: (name: string) => tag(text(name), { class: 'internal', helper: 'localDate' }),
  /** Money in whole minor units. */
  minor: (name: string) => tag(integer(name), { class: 'internal', helper: 'minor' }),
  /** An ISO 4217 currency code. */
  currency: (name: string) => tag(text(name), { class: 'internal', helper: 'currency' }),
  /** An email address, stored trimmed and lower-cased. Personal. May be a table's subject. */
  email: (name: string, options: EraseOptions = {}) => tag(email(name), { class: 'personal', helper: 'email', ...options }),

  public: <B extends SQLiteColumnBuilder<any, any, any>>(builder: B, options: EraseOptions = {}) => tag(builder, { class: 'public', helper: 'wrapped', ...options }),
  /** `encrypted: true` seals the value with the core key, as for special data (webhook secrets, push keys). */
  internal: <B extends SQLiteColumnBuilder<any, any, any>>(builder: B, options: Sealable = {}) => tag(builder, { class: 'internal', helper: 'wrapped', ...options }),
  personal: <B extends SQLiteColumnBuilder<any, any, any>>(builder: B, options: EraseOptions & Sealable = {}) => tag(builder, { class: 'personal', helper: 'wrapped', ...options }),
  freeText: <B extends SQLiteColumnBuilder<any, any, any>>(builder: B, options: EraseOptions = {}) => tag(builder, { class: 'freeText', helper: 'wrapped', ...options }),
  /**
   * Special category data (access needs, health). Encrypted before it reaches the database with
   * `sealSpecial`, so it cannot be searched or indexed, and the helper takes only a name.
   */
  special: (name: string) => tag(text(name), { class: 'special', helper: 'special', encrypted: true }),
  /** A value whose class is chosen row by row, held in a sibling column. For the form builder. */
  perRow: <B extends SQLiteColumnBuilder<any, any, any>>(builder: B, options: { classColumn: string }) => tag(builder, { class: 'perRow', helper: 'wrapped', classColumn: options.classColumn }),
}

/** Every table declared so far, by SQL name. `col.ref` resolves through it. */
const tables = new Map<string, unknown>()

export function declaredTables(): Map<string, unknown> {
  return tables
}

const snakeTable = sqliteTableCreator(name => name, 'snake_case')

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}

/**
 * Declares a table: its name, its columns (each through a `col.*` helper) and its options.
 * The table's name must start with its module's prefix; the manifest check enforces that.
 */
export function defineTable<TName extends string, TColumns extends Record<string, SQLiteColumnBuilder<any, any, any>>>(
  name: TName, columns: TColumns, options: TableOptions,
) {
  const field = (f: string) => `${name}.${f}`
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) throw new DeclarationError(field('name'), 'a table name is the module id in snake_case, then a plural noun')
  if (!options || typeof options !== 'object') throw new DeclarationError(field('options'), 'options are required: at least { realm }')
  const realm = options.realm
  if (!(realm === 'audience' || realm === 'members' || realm === 'operational' || realm === 'system' || (typeof realm === 'object' && typeof realm.column === 'string')))
    throw new DeclarationError(field('realm'), "must be 'audience', 'members', 'operational', 'system' or { column }")

  const metas: TableMeta['columns'] = {}
  let idColumn: string | undefined
  for (const [key, builder] of Object.entries(columns)) {
    const meta = columnMeta(builder)
    if (!meta) throw new DeclarationError(field(key), 'this column has no data class. Wrap it in col.public, col.internal, col.personal, col.freeText, col.special or col.perRow, or use a helper such as col.id or col.ref')
    if (!ALLOWED[meta.class].includes(meta.erase)) throw new DeclarationError(field(key), `a ${meta.class} column cannot be erased with "${meta.erase}"; allowed: ${ALLOWED[meta.class].join(', ')}`)
    if (meta.erase === 'retain' && (!meta.until || !meta.reason)) throw new DeclarationError(field(key), "erase: 'retain' needs `until` (a duration setting) and `reason` (a translation key)")
    const configured = (builder as any).config?.name as string | undefined
    const sql = configured || toSnake(key)
    metas[key] = { sql, meta }
    if (meta.helper === 'id') idColumn = key
  }

  if (idColumn && !options.id) throw new DeclarationError(field('id'), 'a table with col.id() declares its id prefix, such as { id: \'ord\' }')
  if (options.id && !ID_PREFIX.test(options.id)) throw new DeclarationError(field('id'), 'an id prefix is two to four lower-case letters')
  if (options.id && !idColumn) throw new DeclarationError(field('id'), 'an id prefix is declared but the table has no col.id() column')
  if (idColumn) (columns[idColumn] as any).$defaultFn(() => newId(options.id!, { random: options.random }))

  const all = Object.values(metas)
  const subjects = all.filter(c => c.meta.account?.role === 'subject').map(c => c.sql)
  const holdsPersonal = all.some(c => ['personal', 'freeText', 'special', 'perRow'].includes(c.meta.class))
  const subject = options.subject
  if (subject === 'none' && holdsPersonal) throw new DeclarationError(field('subject'), "a table with subject 'none' may not hold personal, free-text or special columns")
  if (subject && typeof subject === 'object' && 'email' in subject) {
    const target = all.find(c => c.sql === subject.email)
    if (!target || target.meta.helper !== 'email') throw new DeclarationError(field('subject'), `subject { email: '${subject.email}' } must name a col.email column`)
    if (subjects.length) throw new DeclarationError(field('subject'), 'a subject is an account or an email, never both')
  }
  const unlinked = subject && typeof subject === 'object' && 'unlinked' in subject ? subject : undefined
  if (unlinked) {
    const target = all.find(c => c.sql === unlinked.account)
    if (!target?.meta.account || target.meta.account.role !== 'subject') throw new DeclarationError(field('subject'), `subject { account: '${unlinked.account}' } must name a col.account(..., { role: 'subject' }) column`)
    if (!target.meta.account.nullable) throw new DeclarationError(field('subject'), `${unlinked.account} is never empty, so it needs no unlinked`)
    if (unlinked.unlinked !== 'staff') throw new DeclarationError(field('subject'), "unlinked is 'staff'")
  }
  for (const c of all) {
    if (c.meta.account?.role === 'subject' && c.meta.account.nullable && unlinked?.account !== c.sql)
      throw new DeclarationError(field('subject'), `the subject column ${c.sql} may be empty: say what happens to rows it cannot link with subject: { account: '${c.sql}', unlinked: 'staff' }`)
  }
  if (holdsPersonal && !subjects.length && !subject && !options.retention)
    throw new DeclarationError(field('subject'), 'this table holds personal data but no subject reaches a person and it has no retention. Add a col.account(..., { role: \'subject\' }) column, a subject or a retention setting')
  for (const [key, c] of Object.entries(metas)) {
    if (c.meta.account?.role === 'actor' && c.meta.account.onMerge !== 'alias') throw new DeclarationError(field(key), "an actor column keeps who did it, so it uses onMerge: 'alias' (the default)")
  }
  if (options.appendOnly) {
    for (const [key, c] of Object.entries(metas)) {
      if (c.meta.account && c.meta.account.onMerge !== 'alias') throw new DeclarationError(field(key), "an append-only table cannot be rewritten by a merge, so its account columns use onMerge: 'alias'")
    }
  }
  if (typeof realm === 'object' && !all.some(c => c.sql === realm.column)) throw new DeclarationError(field('realm'), `realm column "${realm.column}" is not a column of this table`)

  const table = snakeTable(name, columns, options.extra as any)
  const meta: TableMeta = { name, options, columns: metas, subjects }
  ;(table as any)[TABLE] = meta
  tables.set(name, table)
  return table
}

export function tableMeta(table: unknown): TableMeta | undefined {
  return (table as any)?.[TABLE]
}

function quote(name: string) {
  return `\`${name}\``
}

function erasedValue(erase: Erasure): string | undefined {
  if (erase === 'anonymise') return `'${ERASED.anonymise}'`
  if (erase === 'redact') return `'${ERASED.redact}'`
  if (erase === 'clear' || erase === 'retain') return 'NULL'
  return undefined
}

/**
 * The triggers that make a table append-only: no delete, and no update except setting an erasable
 * column to its erased value with every other column unchanged.
 */
export function appendOnlyTriggers(meta: TableMeta): { name: string, sql: string }[] {
  const t = meta.name
  const conditions = Object.values(meta.columns).map(({ sql, meta: m }) => {
    const erased = erasedValue(m.erase)
    const same = `NEW.${quote(sql)} IS OLD.${quote(sql)}`
    return erased ? `(${same} OR NEW.${quote(sql)} IS ${erased})` : same
  })
  return [
    { name: `${t}_append_only_delete`, sql: `CREATE TRIGGER ${quote(`${t}_append_only_delete`)} BEFORE DELETE ON ${quote(t)} BEGIN SELECT RAISE(ABORT, 'append-only: ${t}'); END;` },
    { name: `${t}_append_only_update`, sql: `CREATE TRIGGER ${quote(`${t}_append_only_update`)} BEFORE UPDATE ON ${quote(t)} WHEN NOT (${conditions.join(' AND ')}) BEGIN SELECT RAISE(ABORT, 'append-only: ${t}'); END;` },
  ]
}
