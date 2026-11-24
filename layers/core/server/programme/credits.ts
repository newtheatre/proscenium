// Credits (C-09): who made the show. A credit has a section, a role and a printed name, and may be
// linked to an account. The linked person is told, may change the visibility of their own credit
// with no ability, and holds core.production-team while the production is current (part 6).
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, useDb, useSetting } from '#kit'
import type { UnitView } from '#kit'
import { inAccountScope } from '#kit/accounts'
import { assertTerm } from '../vocabularies/service'
import { notify } from '../notifications/notify'
import { accountById, accountLabel, canonicalAccount } from '../identity/accounts'

export type CreditVisibility = 'public' | 'members' | 'hidden'

export interface Credit {
  id: string
  productionId: string
  accountId: string | null
  /** The linked person's name as staff see it, or null for a credit with no account. */
  accountLabel: string | null
  creditedName: string
  role: string
  sectionTermId: string
  visibility: CreditVisibility
  sort: number
}

export interface CreditInput {
  creditedName: string
  role: string
  sectionTermId: string
  accountId?: string | null
  visibility?: CreditVisibility
}

interface CreditRow {
  id: string
  production_id: string
  account_id: string | null
  account_label: string | null
  credited_name: string
  role: string
  section_term_id: string
  visibility: CreditVisibility
  sort: number
}

const SECTION = 'core.credit-section'
const SECTION_REFUSED = { code: 'core.credit.section-unknown', reason: 'Choose a section from the list.', status: 422 } as const
const CHANGED = { code: 'core.credit.changed', reason: 'The credits changed while you were working. Reload and try again.', status: 409 } as const

const toCredit = (r: CreditRow): Credit => ({
  id: r.id, productionId: r.production_id, accountId: r.account_id, accountLabel: r.account_label, creditedName: r.credited_name,
  role: r.role, sectionTermId: r.section_term_id, visibility: r.visibility, sort: r.sort,
})

const SELECT = `SELECT c.id, c.production_id, c.account_id, c.credited_name, c.role, c.section_term_id, c.visibility, c.sort
  FROM core_production_credits c JOIN core_terms t ON t.id = c.section_term_id`

// Identity labels each linked person, as the survivor of any merge; core reads no account rows itself.
async function labelled(rows: Omit<CreditRow, 'account_label'>[]): Promise<CreditRow[]> {
  const ids = [...new Set(rows.flatMap(r => r.account_id ? [r.account_id] : []))]
  const labels = new Map(await Promise.all(ids.map(async id => [id, await accountLabel(id)] as const)))
  return rows.map(r => ({ ...r, account_label: r.account_id ? labels.get(r.account_id)! : null }))
}

/** A production's credits, by section in the vocabulary's order, then in their own order. */
export async function listCredits(productionId: string): Promise<Credit[]> {
  const rows = await all<CreditRow>(`${SELECT} WHERE c.production_id = ? ORDER BY t.sort, t.id, c.sort, c.id`, productionId)
  return (await labelled(rows)).map(toCredit)
}

async function creditRow(productionId: string, creditId: string): Promise<CreditRow> {
  const row = await first<CreditRow>(`${SELECT} WHERE c.id = ? AND c.production_id = ?`, creditId, productionId)
  if (!row) refuse('core.not-found', 'There is no such credit.', { status: 404 })
  return (await labelled([row!]))[0]!
}

async function productionOf(productionId: string): Promise<{ title: string, state: string }> {
  const row = await first<{ title: string, state: string }>('SELECT title, state FROM core_productions WHERE id = ?', productionId)
  if (!row) refuse('core.not-found', 'There is no such production.', { status: 404 })
  return row!
}

/** An account a credit may name: one that exists, has not been merged away and has not been erased. */
async function checkAccount(accountId: string): Promise<void> {
  const row = await accountById(accountId)
  if (!row || row.merged_into_id || row.anonymised_at) refuse('core.credit.account-unknown', 'Choose a person from the list, or leave the credit unlinked.', { status: 422 })
}

function changed(unit: UnitView, productionId: string, state: string) {
  if (state === 'published') unit.announce('core.production.updated', { productionId, fields: ['credits'] }, { record: ['core.production', productionId] })
}

/** Tells the linked person once, in the members' area and by email unless they switched it off. */
async function tell(unit: UnitView, productionId: string, creditId: string, accountId: string, production: string, role: string, origin: string) {
  await notify(unit, 'core.credit.added', {
    to: accountId,
    variables: { production, role, link: `${origin}/account/credits` },
    dedupeKey: `credit:${creditId}:${accountId}`,
    subject: ['core.production', productionId],
  })
}

export async function addCredit(unit: UnitView, productionId: string, input: CreditInput, origin: string): Promise<string> {
  return insertCredit(unit, productionId, await productionOf(productionId), input, origin)
}

/** A credit on a production read already, or made earlier in this unit (createProduction's credits). */
export async function insertCredit(unit: UnitView, productionId: string, production: { title: string, state: string }, input: CreditInput, origin: string): Promise<string> {
  if (input.accountId) await checkAccount(input.accountId)
  const id = newId('crd')
  unit.add(sql`INSERT INTO core_production_credits (id, production_id, account_id, credited_name, role, section_term_id, visibility, sort)
    SELECT ${id}, ${productionId}, ${input.accountId ?? null}, ${input.creditedName}, ${input.role}, ${input.sectionTermId}, ${input.visibility ?? 'public'},
      (SELECT coalesce(max(sort), -1) + 1 FROM core_production_credits WHERE production_id = ${productionId} AND section_term_id = ${input.sectionTermId})
    WHERE ${assertTerm(input.sectionTermId, SECTION)}`).expect(1, SECTION_REFUSED)
  unit.audit({ action: 'create', record: ['core.production', productionId], detail: { credit: id, linked: !!input.accountId } })
  changed(unit, productionId, production.state)
  if (input.accountId) await tell(unit, productionId, id, input.accountId, production.title, input.role, origin)
  return id
}

export async function updateCredit(unit: UnitView, productionId: string, creditId: string, input: Partial<CreditInput>, origin: string): Promise<void> {
  const production = await productionOf(productionId)
  const row = await creditRow(productionId, creditId)
  const linking = input.accountId !== undefined && input.accountId !== null && input.accountId !== row.account_id
  if (linking) await checkAccount(input.accountId!)
  const moving = input.sectionTermId !== undefined && input.sectionTermId !== row.section_term_id
  const section = input.sectionTermId ?? row.section_term_id
  // A credit moved to another section goes to the end of it.
  unit.add(sql`UPDATE core_production_credits SET
      credited_name = ${input.creditedName ?? row.credited_name},
      role = ${input.role ?? row.role},
      account_id = ${input.accountId === undefined ? row.account_id : input.accountId}, -- exact-account: an assignment of the chosen account, not a read
      visibility = ${input.visibility ?? row.visibility},
      section_term_id = ${section},
      sort = ${moving ? sql`(SELECT coalesce(max(sort), -1) + 1 FROM core_production_credits WHERE production_id = ${productionId} AND section_term_id = ${section})` : sql`sort`}
    WHERE id = ${creditId} AND production_id = ${productionId} AND ${moving ? assertTerm(section, SECTION) : sql`1`}`).expect(1, moving ? SECTION_REFUSED : CHANGED)
  unit.audit({ action: 'update', record: ['core.production', productionId], detail: { credit: creditId, fields: Object.keys(input).sort() } })
  changed(unit, productionId, production.state)
  if (linking) await tell(unit, productionId, creditId, input.accountId!, production.title, input.role ?? row.role, origin)
}

export async function removeCredit(unit: UnitView, productionId: string, creditId: string): Promise<void> {
  const production = await productionOf(productionId)
  await creditRow(productionId, creditId)
  unit.add(sql`DELETE FROM core_production_credits WHERE id = ${creditId} AND production_id = ${productionId}`).expect(1, CHANGED)
  unit.audit({ action: 'delete', record: ['core.production', productionId], detail: { credit: creditId } })
  changed(unit, productionId, production.state)
}

/** Puts one section's credits in the order given. The list names every credit in the section, once. */
export async function reorderCredits(unit: UnitView, productionId: string, sectionTermId: string, ids: string[]): Promise<void> {
  const production = await productionOf(productionId)
  const current = await all<{ id: string }>('SELECT id FROM core_production_credits WHERE production_id = ? AND section_term_id = ?', productionId, sectionTermId)
  const known = new Set(current.map(c => c.id))
  if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some(id => !known.has(id))) refuse(CHANGED.code, CHANGED.reason, { status: CHANGED.status })
  unit.add(sql`UPDATE core_production_credits SET sort = (SELECT CAST(j.key AS INTEGER) FROM json_each(${JSON.stringify(ids)}) j WHERE j.value = core_production_credits.id)
    WHERE production_id = ${productionId} AND section_term_id = ${sectionTermId} AND id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`).expect(ids.length, CHANGED)
  unit.audit({ action: 'update', record: ['core.production', productionId], detail: { creditOrder: sectionTermId } })
  changed(unit, productionId, production.state)
}

export interface MyCredit {
  id: string
  productionId: string
  production: string
  creditedName: string
  role: string
  section: string
  visibility: CreditVisibility
  firstStartsAt: number | null
}

/** "My credits": every credit linked to the person, through the account scope, newest show first. */
export async function myCredits(accountId: string): Promise<MyCredit[]> {
  const rows = await useDb().all<{ id: string, production_id: string, title: string, credited_name: string, role: string, section: string, visibility: CreditVisibility, first_starts_at: number | null }>(
    sql`SELECT c.id, c.production_id, p.title, c.credited_name, c.role, t.label AS section, c.visibility, p.first_starts_at
       FROM core_production_credits c JOIN core_productions p ON p.id = c.production_id JOIN core_terms t ON t.id = c.section_term_id
      WHERE ${inAccountScope('c.account_id', accountId)}
      ORDER BY coalesce(p.first_starts_at, p.created_at) DESC, t.sort, c.sort`,
  )
  return rows.map(r => ({ id: r.id, productionId: r.production_id, production: r.title, creditedName: r.credited_name, role: r.role, section: r.section, visibility: r.visibility, firstStartsAt: r.first_starts_at }))
}

/** How many credits are linked to the person: "My credits" shows while this is above nought. */
export async function myCreditCount(accountId: string): Promise<number> {
  const row = await useDb().get<{ n: number }>(sql`SELECT count(*) AS n FROM core_production_credits WHERE ${inAccountScope('account_id', accountId)}`)
  return row?.n ?? 0
}

/** The linked person changes who sees their own credit. Nothing else about it can change this way. */
export async function setOwnVisibility(unit: UnitView, accountId: string, creditId: string, visibility: CreditVisibility): Promise<void> {
  const row = await useDb().get<{ production_id: string, state: string }>(
    sql`SELECT c.production_id, p.state FROM core_production_credits c JOIN core_productions p ON p.id = c.production_id
      WHERE c.id = ${creditId} AND ${inAccountScope('c.account_id', accountId)}`,
  )
  // Someone else's credit is not found, rather than refused, so its existence is not given away.
  if (!row) refuse('core.not-found', 'There is no such credit.', { status: 404 })
  unit.add(sql`UPDATE core_production_credits SET visibility = ${visibility} WHERE id = ${creditId} AND ${inAccountScope('account_id', accountId)}`)
    .expect(1, { code: 'core.not-found', reason: 'There is no such credit.' })
  unit.audit({ action: 'update', record: ['core.production', row!.production_id], detail: { credit: creditId, visibility } })
  changed(unit, row!.production_id, row!.state)
}

export interface ShownCredit { id: string, creditedName: string, role: string, sectionTermId: string, section: string }

/**
 * The credits a viewer may see on a published production: public ones to everyone, members-only ones
 * on the members' side too. None at all when the production's credits are not public, and hidden
 * credits never. The public site and the open data read credits only through this.
 */
export async function shownCredits(productionId: string, members = false): Promise<ShownCredit[]> {
  return all<ShownCredit>(
    `SELECT c.id, c.credited_name AS creditedName, c.role, c.section_term_id AS sectionTermId, t.label AS section
       FROM core_production_credits c JOIN core_productions p ON p.id = c.production_id JOIN core_terms t ON t.id = c.section_term_id
      WHERE c.production_id = ? AND p.state IN ('published', 'cancelled') AND p.credits_public = 1
        AND c.visibility IN (${members ? "'public', 'members'" : "'public'"})
      ORDER BY t.sort, t.id, c.sort, c.id`,
    productionId,
  )
}

/** Whether the production still counts as current for its team: always while it has no performances. */
const current = (standing: number, now: number) => sql`(p.last_ends_at IS NULL OR p.last_ends_at + ${standing} > ${now})`
const onProduction = (productionId?: string) => productionId ? sql` AND c.production_id = ${productionId}` : sql``

/** core.production-team for one account: on one production, or on any. */
export async function onProductionTeam(accountId: string, productionId?: string): Promise<{ holds: boolean, until?: number }> {
  const standing = (await useSetting('core.programme.team-standing-after') as number) * 1000 // not-policy: seconds to milliseconds
  const row = await useDb().get<{ until: number | null, open: number | null }>(
    sql`SELECT max(CASE WHEN p.last_ends_at IS NULL THEN 1 ELSE 0 END) AS open, max(p.last_ends_at + ${standing}) AS until
       FROM core_production_credits c JOIN core_productions p ON p.id = c.production_id
      WHERE ${inAccountScope('c.account_id', accountId)} AND ${current(standing, nowMs())}${onProduction(productionId)}`,
  )
  if (!row || (row.until === null && !row.open)) return { holds: false }
  return row.open ? { holds: true } : { holds: true, until: row.until! }
}

/** Everyone holding core.production-team now, on one production or on any: the survivors' ids. */
export async function productionTeamHolders(productionId?: string): Promise<string[]> {
  const standing = (await useSetting('core.programme.team-standing-after') as number) * 1000 // not-policy: seconds to milliseconds
  const rows = await useDb().all<{ id: string }>(
    sql`SELECT DISTINCT c.account_id AS id
       FROM core_production_credits c JOIN core_productions p ON p.id = c.production_id
      WHERE c.account_id IS NOT NULL AND ${current(standing, nowMs())}${onProduction(productionId)}`,
  )
  return [...new Set(await Promise.all(rows.map(r => canonicalAccount(r.id))))].sort()
}
