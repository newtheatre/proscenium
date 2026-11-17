// Vocabularies (part 2, group 3; C-20, C-21): reusable lists of options every module shares. A
// record stores a term's id, never its label, so a rename reaches every record without rewriting
// one. Retiring hides a term from pickers and nothing else. A term is deleted only if nothing has
// ever pointed at it: every reference to core_terms is restrict, so the database is the last word.
import { sql, type SQL } from 'drizzle-orm'
import { all, createUnit, first, newId, nowMs, refuse, usePoint, useContext } from '#kit'
import type { UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { terms, termGroups } from '../db/domain'

export interface VocabularyDecl {
  id: string
  label: string
  description?: string
  ordering?: 'manual' | 'alphabetical'
  locked?: boolean
  termClass?: 'public' | 'internal'
  /** Headings, in order. A grouped vocabulary keeps its terms under them, and each term names its heading. */
  groups?: string[]
  terms: { slug: string, label: string, description?: string, icon?: string, group?: string }[]
}

export interface Vocabulary {
  key: string
  owner: string
  label: string
  description: string | null
  ordering: 'manual' | 'alphabetical'
  locked: boolean
  termClass: 'public' | 'internal'
  grouped: boolean
}

export interface TermGroup {
  id: string
  vocabularyKey: string
  label: string
  sort: number
}

export interface Term {
  id: string
  vocabularyKey: string
  slug: string
  label: string
  description: string | null
  icon: string | null
  sort: number
  seeded: boolean
  retired: boolean
  mergedIntoId: string | null
  groupId: string | null
}

interface TermRow {
  id: string
  vocabulary_key: string
  slug: string
  label: string
  description: string | null
  icon: string | null
  sort: number
  seeded: number
  retired_at: number | null
  merged_into_id: string | null
  group_id: string | null
}

interface VocabularyRow {
  key: string
  owner: string
  label: string
  description: string | null
  ordering: 'manual' | 'alphabetical'
  locked: number
  term_class: 'public' | 'internal'
  grouped: number
}

const toTerm = (r: TermRow): Term => ({
  id: r.id,
  vocabularyKey: r.vocabulary_key,
  slug: r.slug,
  label: r.label,
  description: r.description,
  icon: r.icon,
  sort: r.sort,
  seeded: !!r.seeded,
  retired: r.retired_at !== null,
  mergedIntoId: r.merged_into_id,
  groupId: r.group_id,
})

const toVocabulary = (r: VocabularyRow): Vocabulary => ({
  key: r.key,
  owner: r.owner,
  label: r.label,
  description: r.description,
  ordering: r.ordering,
  locked: !!r.locked,
  termClass: r.term_class,
  grouped: !!r.grouped,
})

const NOT_FOUND = () => refuse('core.vocabulary.not-found', 'There is no such vocabulary.', { status: 404 })
const TERM_NOT_FOUND = () => refuse('core.term.not-found', 'This vocabulary has no such term.', { status: 404 })

/** The vocabularies declared by modules that are on, by key. */
export async function declaredVocabularies(): Promise<Map<string, { module: string, decl: VocabularyDecl }>> {
  const out = new Map<string, { module: string, decl: VocabularyDecl }>()
  for (const c of await usePoint<VocabularyDecl>('core.vocabulary')) out.set(c.value.id, { module: c.module, decl: c.value })
  return out
}

/**
 * Makes any declared vocabulary that does not exist yet, with its starting terms. Never touches
 * one that exists: from then on the theatre owns its terms. Safe to run at any time, by anyone.
 */
export async function ensureVocabularies(moduleId?: string): Promise<number> {
  const context = useContext()
  if (context.cache.vocabulariesEnsured && !moduleId) return 0
  const declared = [...(await declaredVocabularies()).values()].filter(d => !moduleId || d.module === moduleId)
  const existing = new Set((await all<{ key: string }>('SELECT key FROM core_vocabularies')).map(r => r.key))
  const missing = declared.filter(d => !existing.has(d.decl.id))
  if (!moduleId) context.cache.vocabulariesEnsured = true
  const adopted = await adoptHeadings(declared)
  if (!missing.length) return adopted
  const unit = createUnit()
  for (const { module, decl } of missing) {
    unit.add(sql`INSERT INTO core_vocabularies (key, owner, label, description, ordering, locked, term_class, grouped)
      VALUES (${decl.id}, ${module}, ${decl.label}, ${decl.description ?? null}, ${decl.ordering ?? 'manual'}, ${decl.locked ? 1 : 0}, ${decl.termClass ?? 'public'}, ${decl.groups ? 1 : 0})`)
    const groupIds = new Map((decl.groups ?? []).map(label => [label, newId('tgr')]))
    if (groupIds.size) unit.insertSet(termGroups, [...groupIds].map(([label, id], sort) => ({ id, vocabularyKey: decl.id, label, sort })))
    unit.insertSet(terms, decl.terms.map((t, sort) => ({ vocabularyKey: decl.id, slug: t.slug, label: t.label, description: t.description ?? null, icon: t.icon ?? null, sort, seeded: true, groupId: t.group ? groupIds.get(t.group) ?? null : null })))
  }
  try {
    await unit.commit()
  }
  catch (error) {
    // Another request made them at the same moment; theirs stands.
    if (/UNIQUE|PRIMARY KEY/i.test(String((error as Error)?.message))) return 0
    throw error
  }
  return missing.length + adopted
}

/** Adds the declared terms an existing vocabulary lacks, by slug, leaving any whose label a live term already has. Set-wise, so the batch stays small. */
async function topUpTerms(unit: UnitView, decl: VocabularyDecl, groupIds: Map<string, string>): Promise<void> {
  const existing = await all<{ slug: string, label: string, retired_at: number | null }>('SELECT slug, label, retired_at FROM core_terms WHERE vocabulary_key = ?', decl.id)
  const have = new Set(existing.map(r => r.slug))
  const labels = new Set(existing.filter(r => r.retired_at === null).map(r => r.label.toLowerCase()))
  const assign = decl.terms.filter(t => t.group && have.has(t.slug)).map(t => [t.slug, groupIds.get(t.group!) ?? null])
  if (assign.length) {
    unit.add(sql`UPDATE core_terms SET group_id = (SELECT json_extract(value, '$[1]') FROM json_each(${JSON.stringify(assign)}) WHERE json_extract(value, '$[0]') = core_terms.slug)
      WHERE vocabulary_key = ${decl.id} AND group_id IS NULL AND slug IN (SELECT json_extract(value, '$[0]') FROM json_each(${JSON.stringify(assign)}))`)
  }
  let sort = (await first<{ n: number }>('SELECT coalesce(max(sort), -1) + 1 AS n FROM core_terms WHERE vocabulary_key = ?', decl.id))!.n
  const fresh = decl.terms.filter(t => !have.has(t.slug) && !labels.has(t.label.toLowerCase()))
  if (fresh.length) {
    unit.insertSet(terms, fresh.map(t => ({ vocabularyKey: decl.id, slug: t.slug, label: t.label, description: t.description ?? null, icon: t.icon ?? null, sort: sort++, seeded: true, groupId: t.group ? groupIds.get(t.group) ?? null : null })))
  }
}

/**
 * A site made before headings existed keeps its vocabulary and its terms. The first time a grouped
 * declaration meets an ungrouped vocabulary of the same key it gains the headings, the declared
 * terms it lacks go under them, and a term the theatre added itself goes under "Other", so every
 * live term has a heading. The staging effects, which the migration moved out of the advisory
 * vocabulary, are topped up with the declared terms they lack.
 */
async function adoptHeadings(declared: { module: string, decl: VocabularyDecl }[]): Promise<number> {
  const ungrouped = await all<{ key: string }>('SELECT key FROM core_vocabularies WHERE grouped = 0')
  const todo = declared.filter(d => d.decl.groups && ungrouped.some(u => u.key === d.decl.id))
  if (!todo.length) return 0
  const unit = createUnit()
  for (const { decl } of todo) {
    const labels = [...decl.groups!]
    const known = new Set(decl.terms.map(t => t.slug))
    const own = await first('SELECT 1 FROM core_terms WHERE vocabulary_key = ? AND group_id IS NULL AND slug NOT IN (SELECT value FROM json_each(?))', decl.id, JSON.stringify([...known]))
    if (own) labels.push('Other')
    const groupIds = new Map(labels.map(label => [label, newId('tgr')]))
    unit.add(sql`UPDATE core_vocabularies SET grouped = 1 WHERE key = ${decl.id}`)
    unit.insertSet(termGroups, [...groupIds].map(([label, id], sort) => ({ id, vocabularyKey: decl.id, label, sort })))
    await topUpTerms(unit, decl, groupIds)
    if (own) unit.add(sql`UPDATE core_terms SET group_id = ${groupIds.get('Other')!} WHERE vocabulary_key = ${decl.id} AND group_id IS NULL`)
  }
  const effects = declared.find(d => d.decl.id === 'core.staging-effect')
  if (effects && await first("SELECT 1 FROM core_vocabularies WHERE key = 'core.staging-effect'")) await topUpTerms(unit, effects.decl, new Map())
  try {
    await unit.commit()
  }
  catch (error) {
    if (/UNIQUE|PRIMARY KEY/i.test(String((error as Error)?.message))) return 0
    throw error
  }
  return todo.length
}

export async function getVocabulary(key: string): Promise<Vocabulary | null> {
  await ensureVocabularies()
  const row = await first<VocabularyRow>('SELECT * FROM core_vocabularies WHERE key = ?', key)
  return row ? toVocabulary(row) : null
}

export async function listVocabularies(): Promise<(Vocabulary & { live: number, retired: number })[]> {
  await ensureVocabularies()
  const rows = await all<VocabularyRow & { live: number, retired: number }>(`SELECT v.*,
      (SELECT count(*) FROM core_terms t WHERE t.vocabulary_key = v.key AND t.retired_at IS NULL) AS live,
      (SELECT count(*) FROM core_terms t WHERE t.vocabulary_key = v.key AND t.retired_at IS NOT NULL) AS retired
    FROM core_vocabularies v ORDER BY v.owner = 'theatre', v.owner, v.label`)
  return rows.map(r => ({ ...toVocabulary(r), live: r.live, retired: r.retired }))
}

/** Terms in the vocabulary's order. Pickers leave retired terms out. */
export async function listTerms(vocabularyKey: string, options: { includeRetired?: boolean } = {}): Promise<Term[]> {
  const vocabulary = await getVocabulary(vocabularyKey)
  if (!vocabulary) return []
  const order = vocabulary.ordering === 'alphabetical' ? 'lower(label), sort' : 'sort, lower(label)'
  const rows = await all<TermRow>(`SELECT * FROM core_terms WHERE vocabulary_key = ? ${options.includeRetired ? '' : 'AND retired_at IS NULL'} ORDER BY ${order}`, vocabularyKey)
  return rows.map(toTerm)
}

/** The headings of a grouped vocabulary, in order. Empty for one that is not grouped. */
export async function listTermGroups(vocabularyKey: string): Promise<TermGroup[]> {
  await ensureVocabularies()
  const rows = await all<{ id: string, vocabulary_key: string, label: string, sort: number }>('SELECT id, vocabulary_key, label, sort FROM core_term_groups WHERE vocabulary_key = ? ORDER BY sort, lower(label)', vocabularyKey)
  return rows.map(r => ({ id: r.id, vocabularyKey: r.vocabulary_key, label: r.label, sort: r.sort }))
}

/** One term, following merged_into_id. Works for a retired term, so old records keep a label. */
export async function getTerm(id: string): Promise<Term | null> {
  let row = await first<TermRow>('SELECT * FROM core_terms WHERE id = ?', id)
  for (let hops = 0; row?.merged_into_id && hops < 10; hops++) { // not-policy: a guard against a loop
    row = await first<TermRow>('SELECT * FROM core_terms WHERE id = ?', row.merged_into_id) ?? row
  }
  return row ? toTerm(row) : null
}

/**
 * A predicate a caller puts on its own write: the term exists, is live and belongs to that
 * vocabulary. For example `INSERT ... SELECT ... WHERE ${assertTerm(id, key)}` then `.expect(1)`.
 */
export function assertTerm(id: string, vocabularyKey: string): SQL {
  return sql`EXISTS (SELECT 1 FROM core_terms WHERE id = ${id} AND vocabulary_key = ${vocabularyKey} AND retired_at IS NULL)`
}

/** Every column, in every table, that points at a term. */
function termReferences(): { table: string, column: string }[] {
  const out: { table: string, column: string }[] = []
  for (const { meta } of useRegistry().tables.values()) {
    for (const c of Object.values(meta.columns)) if (c.meta.ref?.table === 'core_terms') out.push({ table: meta.name, column: c.sql })
  }
  return out
}

/** How many records use each of the given terms, across every module's tables. */
export async function termUsage(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map(ids.map(id => [id, 0]))
  if (!ids.length) return counts
  const list = JSON.stringify(ids)
  for (const { table, column } of termReferences()) {
    const rows = await all<{ id: string, n: number }>(`SELECT "${column}" AS id, count(*) AS n FROM "${table}" WHERE "${column}" IN (SELECT value FROM json_each(?)) GROUP BY "${column}"`, list)
    for (const r of rows) counts.set(r.id, (counts.get(r.id) ?? 0) + r.n)
  }
  return counts
}

async function vocabularyOrRefuse(key: string): Promise<Vocabulary> {
  return (await getVocabulary(key)) ?? NOT_FOUND()
}

async function termOrRefuse(vocabularyKey: string, id: string): Promise<TermRow> {
  const row = await first<TermRow>('SELECT * FROM core_terms WHERE id = ? AND vocabulary_key = ?', id, vocabularyKey)
  return row ?? TERM_NOT_FOUND()
}

const LABEL_TAKEN = { code: 'core.term.label-taken', reason: 'Another live term in this vocabulary has that label.', remedy: 'Choose a different label, or restore the retired term that has it.' }
const LOCKED = () => refuse('core.vocabulary.locked', 'This vocabulary is locked: its terms can be renamed and reordered, but not added, retired or deleted.', { status: 409 })

/** The case-insensitive clash check, as a guard: the unique index is the real enforcement. */
function labelFree(vocabularyKey: string, label: string, exceptId?: string): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM core_terms WHERE vocabulary_key = ${vocabularyKey} AND retired_at IS NULL AND lower(label) = lower(${label}) AND id IS NOT ${exceptId ?? null})`
}

function slugFrom(label: string): string {
  return label.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'term' // not-policy: a slug's pattern
}

export interface TermInput { label: string, description?: string | null, icon?: string | null }

export async function addTerm(unit: UnitView, vocabularyKey: string, input: TermInput): Promise<string> {
  const vocabulary = await vocabularyOrRefuse(vocabularyKey)
  if (vocabulary.locked) LOCKED()
  const base = slugFrom(input.label)
  const taken = new Set((await all<{ slug: string }>('SELECT slug FROM core_terms WHERE vocabulary_key = ? AND (slug = ? OR slug LIKE ?)', vocabularyKey, base, `${base}-%`)).map(r => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  const id = newId('trm')
  const next = await first<{ sort: number }>('SELECT coalesce(max(sort), -1) + 1 AS sort FROM core_terms WHERE vocabulary_key = ?', vocabularyKey)
  unit.add(sql`INSERT INTO core_terms (id, vocabulary_key, slug, label, description, icon, sort, seeded, created_at)
    SELECT ${id}, ${vocabularyKey}, ${slug}, ${input.label}, ${input.description ?? null}, ${input.icon ?? null}, ${next?.sort ?? 0}, 0, ${nowMs()}
    WHERE ${labelFree(vocabularyKey, input.label)}`).expect(1, LABEL_TAKEN)
  unit.audit({ action: 'create', record: ['core.vocabulary', vocabularyKey], detail: { termId: id } })
  return id
}

export async function updateTerm(unit: UnitView, vocabularyKey: string, id: string, input: Partial<TermInput>): Promise<void> {
  await vocabularyOrRefuse(vocabularyKey)
  const row = await termOrRefuse(vocabularyKey, id)
  const label = input.label ?? row.label
  const description = input.description === undefined ? row.description : input.description
  const icon = input.icon === undefined ? row.icon : input.icon
  const guard = row.retired_at === null ? labelFree(vocabularyKey, label, id) : sql`1`
  unit.add(sql`UPDATE core_terms SET label = ${label}, description = ${description}, icon = ${icon} WHERE id = ${id} AND ${guard}`).expect(1, LABEL_TAKEN)
  unit.audit({ action: 'update', record: ['core.vocabulary', vocabularyKey], detail: { termId: id } })
}

/** Puts the terms in the order given. Every term of the vocabulary, retired ones too, must be listed. */
export async function reorderTerms(unit: UnitView, vocabularyKey: string, ids: string[]): Promise<void> {
  await vocabularyOrRefuse(vocabularyKey)
  const current = (await all<{ id: string }>('SELECT id FROM core_terms WHERE vocabulary_key = ?', vocabularyKey)).map(r => r.id)
  const given = new Set(ids)
  if (given.size !== ids.length || current.length !== ids.length || current.some(id => !given.has(id)))
    refuse('core.term.order-stale', 'The vocabulary changed while you were reordering it.', { remedy: 'Reload the list and reorder again.', status: 409 })
  const order = JSON.stringify(ids.map((id, sort) => [id, sort]))
  unit.add(sql`UPDATE core_terms SET sort = (SELECT json_extract(value, '$[1]') FROM json_each(${order}) WHERE json_extract(value, '$[0]') = core_terms.id)
    WHERE vocabulary_key = ${vocabularyKey}`).expect(ids.length, { code: 'core.term.order-stale', reason: 'The vocabulary changed while you were reordering it.', remedy: 'Reload the list and reorder again.' })
  unit.audit({ action: 'update', record: ['core.vocabulary', vocabularyKey], detail: { reordered: ids.length } })
}

export async function retireTerm(unit: UnitView, vocabularyKey: string, id: string): Promise<void> {
  const vocabulary = await vocabularyOrRefuse(vocabularyKey)
  if (vocabulary.locked) LOCKED()
  const row = await termOrRefuse(vocabularyKey, id)
  if (row.retired_at !== null) return
  unit.add(sql`UPDATE core_terms SET retired_at = ${nowMs()} WHERE id = ${id} AND retired_at IS NULL`).expect(1)
  unit.audit({ action: 'state', ability: 'core.vocabulary.manage', record: ['core.vocabulary', vocabularyKey], detail: { termId: id, to: 'retired' } })
  unit.announce('core.term.retired', { termId: id, vocabulary: vocabularyKey }, { record: ['core.vocabulary', vocabularyKey] })
}

/** Brings a retired term back, if no live term has taken its name meanwhile. */
export async function restoreTerm(unit: UnitView, vocabularyKey: string, id: string): Promise<void> {
  const vocabulary = await vocabularyOrRefuse(vocabularyKey)
  if (vocabulary.locked) LOCKED()
  const row = await termOrRefuse(vocabularyKey, id)
  if (row.retired_at === null) return
  if (row.merged_into_id) refuse('core.term.merged', 'This term was merged into another, so it cannot be restored.', { status: 409 })
  unit.add(sql`UPDATE core_terms SET retired_at = NULL WHERE id = ${id} AND retired_at IS NOT NULL AND ${labelFree(vocabularyKey, row.label, id)}`).expect(1, LABEL_TAKEN)
  unit.audit({ action: 'state', ability: 'core.vocabulary.manage', record: ['core.vocabulary', vocabularyKey], detail: { termId: id, to: 'live' } })
}

const IN_USE = { code: 'core.term.in-use', reason: 'Records use this term, so it cannot be deleted.', remedy: 'Retire it instead: it leaves every picker and stays on the records that use it.' }

/** Deletes a term nothing points at. The database's restrict references refuse anything else. */
export async function deleteTerm(vocabularyKey: string, id: string): Promise<void> {
  const vocabulary = await vocabularyOrRefuse(vocabularyKey)
  if (vocabulary.locked) LOCKED()
  const row = await termOrRefuse(vocabularyKey, id)
  if (row.seeded && vocabulary.owner !== 'theatre')
    refuse('core.term.seeded', 'This term came with the platform, so it can be retired but not deleted.', { status: 409 })
  if (((await termUsage([id])).get(id) ?? 0) > 0) refuse(IN_USE.code, IN_USE.reason, { remedy: IN_USE.remedy, status: 409 })
  const unit = createUnit()
  unit.add(sql`DELETE FROM core_terms WHERE id = ${id}`).expect(1)
  unit.audit({ action: 'delete', record: ['core.vocabulary', vocabularyKey], detail: { termId: id } })
  try {
    await unit.commit()
  }
  catch (error) {
    // A record took the term between the count and the delete: the reference refused it.
    if (/FOREIGN KEY/i.test(String((error as Error)?.message))) refuse(IN_USE.code, IN_USE.reason, { remedy: IN_USE.remedy, status: 409 })
    throw error
  }
}

export interface VocabularyInput { label: string, description?: string | null, ordering?: 'manual' | 'alphabetical' }

/** A theatre's own vocabulary. Its key is x.<slug of the label>. */
export async function createVocabulary(unit: UnitView, input: VocabularyInput): Promise<string> {
  const base = `x.${slugFrom(input.label)}`
  const taken = new Set((await all<{ key: string }>('SELECT key FROM core_vocabularies WHERE key = ? OR key LIKE ?', base, `${base}-%`)).map(r => r.key))
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
  unit.add(sql`INSERT INTO core_vocabularies (key, owner, label, description, ordering, locked, term_class)
    VALUES (${key}, 'theatre', ${input.label}, ${input.description ?? null}, ${input.ordering ?? 'manual'}, 0, 'public')`)
  unit.audit({ action: 'create', record: ['core.vocabulary', key] })
  return key
}

export async function updateVocabulary(unit: UnitView, key: string, input: Partial<VocabularyInput>): Promise<void> {
  const vocabulary = await vocabularyOrRefuse(key)
  unit.add(sql`UPDATE core_vocabularies SET label = ${input.label ?? vocabulary.label}, description = ${input.description === undefined ? vocabulary.description : input.description},
    ordering = ${input.ordering ?? vocabulary.ordering} WHERE key = ${key}`).expect(1)
  unit.audit({ action: 'update', record: ['core.vocabulary', key] })
}
