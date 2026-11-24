// Campaigns (FR-10 to FR-12, rules K1 and K2): appeals with a page of their own and, if set, a
// target. A draft is published to open at its opening time; the task opens and closes campaigns
// by their times. Raised is computed from the module's own rows each time it is read.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { holdersOf, notify } from '#modules/core'
import { LIST_AMOUNTS } from './db/schema'
import { getFund } from './funds'
import { amountWords } from './words'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/ // not-policy: the shape of one part of an address
// The Support pages' own addresses, which a campaign's page would hide.
const RESERVED = ['give', 'thanks', 'gift-aid'] // not-policy: page addresses

export const campaignFields = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(80).regex(SLUG), // not-policy: the column's bound
  title: z.string().trim().min(1).max(120), // not-policy: the column's bound
  summary: z.string().trim().min(1).max(200), // not-policy: the column's bound
  body: z.string().trim().max(20000).nullable(), // not-policy: shape bound
  fundId: z.string().min(1),
  productionId: z.string().nullable(),
  targetMinor: z.number().int().min(1).nullable(),
  offsetMinor: z.number().int().min(0),
  offsetNote: z.string().trim().max(200).nullable(), // not-policy: shape bound
  opensAt: z.number().int().positive(),
  closesAt: z.number().int().positive().nullable(),
  showTotal: z.boolean().optional(),
  countGiftAid: z.boolean().optional(),
  listNames: z.boolean(),
  listAmounts: z.enum(LIST_AMOUNTS),
}).strict()
export type CampaignFields = z.infer<typeof campaignFields>

export interface CampaignLine {
  id: string
  slug: string
  title: string
  state: 'draft' | 'open' | 'closed' | 'archived'
  targetMinor: number | null
  raisedMinor: number
  currency: string
  opensAt: number
  closesAt: number | null
  publishedAt: number | null
  fund: string
}
export interface Campaign extends CampaignLine {
  summary: string
  body: string | null
  fundId: string
  productionId: string | null
  offsetMinor: number
  offsetNote: string | null
  showTotal: boolean
  countGiftAid: boolean
  listNames: boolean
  listAmounts: (typeof LIST_AMOUNTS)[number]
  targetReachedAt: number | null
  received: boolean
  createdBy: string
}

// K1: received gifts less refunds, plus what was raised elsewhere. Gift Aid counts with its slice.
export const RAISED = `(c.offset_minor + coalesce((SELECT sum(d.amount_minor - d.refunded_minor) FROM fundraising_donations d
  WHERE d.campaign_id = c.id AND d.state IN ('received', 'refunded')), 0))`
const LINE = `c.id, c.slug, c.title, c.state, c.target_minor AS targetMinor, ${RAISED} AS raisedMinor, c.currency,
  c.opens_at AS opensAt, c.closes_at AS closesAt, c.published_at AS publishedAt, f.name AS fund`
const FULL = `${LINE}, c.summary, c.body, c.fund_id AS fundId, c.production_id AS productionId, c.offset_minor AS offsetMinor,
  c.offset_note AS offsetNote, c.show_total AS showTotal, c.count_gift_aid AS countGiftAid, c.list_names AS listNames,
  c.list_amounts AS listAmounts, c.target_reached_at AS targetReachedAt, c.created_by AS createdBy,
  EXISTS (SELECT 1 FROM fundraising_donations d WHERE d.campaign_id = c.id AND d.state IN ('received', 'refunded')) AS received`
const FROM = 'FROM fundraising_campaigns c JOIN fundraising_funds f ON f.id = c.fund_id'
const FLAGS = ['showTotal', 'countGiftAid', 'listNames', 'received'] as const
const shape = (row: Record<string, unknown>): Campaign => {
  const c = { ...row } as Record<string, unknown>
  for (const flag of FLAGS) c[flag] = !!c[flag]
  return c as unknown as Campaign
}

export async function listCampaigns(): Promise<CampaignLine[]> {
  return all<CampaignLine>(`SELECT ${LINE} ${FROM}
    ORDER BY CASE c.state WHEN 'open' THEN 0 WHEN 'draft' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END, c.opens_at DESC`) // not-policy: list order
}

export async function getCampaign(where: { id: string } | { slug: string }): Promise<Campaign | null> {
  const row = 'id' in where
    ? await first<Record<string, unknown>>(`SELECT ${FULL} ${FROM} WHERE c.id = ?`, where.id)
    : await first<Record<string, unknown>>(`SELECT ${FULL} ${FROM} WHERE c.slug = ?`, where.slug)
  return row ? shape(row) : null
}

export async function requireCampaign(id: string): Promise<Campaign> {
  return await getCampaign({ id }) ?? refuse('core.not-found', 'There is no campaign with that reference.', { status: 404 })
}

const SLUG_TAKEN = { code: 'fundraising.campaign.slug-taken', reason: 'Another campaign has that address.' }

const field = (name: string, code: string, reason: string, status = 422) => refuse(code, reason, { status, fields: { [name]: code } }) // not-policy: HTTP status

function checkShape(input: CampaignFields): void {
  if (RESERVED.includes(input.slug)) field('slug', 'fundraising.campaign.slug-reserved', 'That address belongs to another page.')
  if (input.closesAt !== null && input.closesAt <= input.opensAt) field('closesAt', 'fundraising.campaign.closes-first', 'A campaign closes after it opens.')
  if (input.offsetMinor > 0 && !input.offsetNote) field('offsetNote', 'fundraising.campaign.offset-note', 'Say where the money raised elsewhere came from.')
}

async function checkFund(input: CampaignFields, except?: Campaign): Promise<void> {
  const fund = await getFund(input.fundId)
  if (!fund || (fund.state !== 'active' && fund.id !== except?.fundId)) field('fundId', 'fundraising.campaign.fund-closed', 'That fund is not taking gifts.', 409) // not-policy: HTTP status
  if (except?.received && except.fundId !== input.fundId) field('fundId', 'fundraising.campaign.fund-fixed', 'This campaign has received gifts, so its fund cannot change.', 409) // not-policy: HTTP status
}

async function checkFields(input: CampaignFields, except?: Campaign): Promise<void> {
  checkShape(input)
  if (await first('SELECT 1 FROM fundraising_campaigns WHERE slug = ? AND id <> ?', input.slug, except?.id ?? '')) field('slug', SLUG_TAKEN.code, SLUG_TAKEN.reason, 409) // not-policy: HTTP status
  await checkFund(input, except)
  if (input.productionId && !await first('SELECT 1 FROM core_productions WHERE id = ?', input.productionId)) field('productionId', 'core.not-found', 'There is no production with that reference.', 404) // not-policy: HTTP status
}

const COLUMNS = 'slug = ?, title = ?, summary = ?, body = ?, fund_id = ?, production_id = ?, target_minor = ?, offset_minor = ?, offset_note = ?, opens_at = ?, closes_at = ?, show_total = ?, count_gift_aid = ?, list_names = ?, list_amounts = ?'
const values = (input: CampaignFields, flags: { showTotal: boolean, countGiftAid: boolean }) => [
  input.slug, input.title, input.summary, input.body || null, input.fundId, input.productionId, input.targetMinor, input.offsetMinor,
  input.offsetNote || null, input.opensAt, input.closesAt, flags.showTotal ? 1 : 0, flags.countGiftAid ? 1 : 0, input.listNames ? 1 : 0, input.listAmounts,
]

/** FR-10: a new campaign, a draft until published. */
export async function createCampaign(unit: UnitView, actor: Actor, input: CampaignFields): Promise<string> {
  await checkFields(input)
  const flags = {
    showTotal: input.showTotal ?? await useSetting('fundraising.campaigns.show-total') as boolean,
    countGiftAid: input.countGiftAid ?? await useSetting('fundraising.campaigns.count-gift-aid') as boolean,
  }
  const id = newId('gcp')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO fundraising_campaigns (id, ${COLUMNS.replaceAll(' = ?', '')}, currency, state, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    params: [id, ...values(input, flags), await useSetting('core.locale.currency') as string, actor.accountId ?? null, at, at],
  }).expect(1, SLUG_TAKEN)
  unit.audit({ action: 'create', record: ['fundraising.campaign', id] })
  return id
}

export async function updateCampaign(unit: UnitView, campaign: Campaign, input: CampaignFields): Promise<void> {
  if (campaign.state === 'archived') refuse('fundraising.campaign.archived', 'Restore this campaign before changing it.', { status: 409 })
  await checkFields(input, campaign)
  const flags = { showTotal: input.showTotal ?? campaign.showTotal, countGiftAid: input.countGiftAid ?? campaign.countGiftAid }
  unit.add({
    sql: `UPDATE fundraising_campaigns SET ${COLUMNS}, updated_at = ? WHERE id = ? AND state <> 'archived'
      AND (fund_id = ? OR NOT EXISTS (SELECT 1 FROM fundraising_donations WHERE campaign_id = ? AND state IN ('received', 'refunded')))`,
    params: [...values(input, flags), nowMs(), campaign.id, input.fundId, campaign.id],
  }).expect(1, { code: 'fundraising.campaign.changed', reason: 'This campaign changed while you were editing it.' })
  unit.audit({ action: 'update', record: ['fundraising.campaign', campaign.id] })
}

const STATE_CHANGED = { code: 'fundraising.campaign.changed', reason: 'This campaign changed while you were editing it.' }

function open(unit: UnitView, id: string, from: 'draft' | 'closed', at: number): void {
  // Reopening a campaign whose closing time has passed clears it, or the task would close it again.
  unit.add({
    sql: `UPDATE fundraising_campaigns SET state = 'open', published_at = coalesce(published_at, ?),
      closes_at = CASE WHEN closes_at <= ? THEN NULL ELSE closes_at END, updated_at = ? WHERE id = ? AND state = ?`,
    params: [at, at, at, id, from],
  }).expect(1, STATE_CHANGED)
  unit.announce('fundraising.campaign.opened', { campaignId: id }, { record: ['fundraising.campaign', id] })
}

function close(unit: UnitView, id: string, at: number): void {
  unit.add({ sql: 'UPDATE fundraising_campaigns SET state = \'closed\', updated_at = ? WHERE id = ? AND state = \'open\'', params: [at, id] }).expect(1, STATE_CHANGED)
  unit.announce('fundraising.campaign.closed', { campaignId: id }, { record: ['fundraising.campaign', id] })
}

export type CampaignStep = 'publish' | 'close' | 'reopen' | 'archive' | 'restore'

const ALLOWED: Record<CampaignStep, Campaign['state']> = { publish: 'draft', close: 'open', reopen: 'closed', archive: 'closed', restore: 'archived' }

/** Part 3's moves made by hand. Publishing opens at once, or at the opening time if that is later. */
export function moveCampaign(unit: UnitView, campaign: Campaign, step: CampaignStep): void {
  const draftArchive = step === 'archive' && campaign.state === 'draft'
  if (campaign.state !== ALLOWED[step] && !draftArchive)
    refuse('fundraising.campaign.wrong-state', 'This campaign cannot do that now.', { status: 409 })
  const at = nowMs()
  if (step === 'publish' && campaign.opensAt > at) {
    unit.add({ sql: 'UPDATE fundraising_campaigns SET published_at = ?, updated_at = ? WHERE id = ? AND state = \'draft\'', params: [at, at, campaign.id] }).expect(1, STATE_CHANGED)
  }
  else if (step === 'publish' || step === 'reopen') open(unit, campaign.id, campaign.state as 'draft' | 'closed', at)
  else if (step === 'close') close(unit, campaign.id, at)
  else {
    const to = step === 'archive' ? 'archived' : 'closed'
    unit.add({ sql: 'UPDATE fundraising_campaigns SET state = ?, updated_at = ? WHERE id = ? AND state = ?', params: [to, at, campaign.id, campaign.state] }).expect(1, STATE_CHANGED)
  }
  unit.audit({ action: 'update', record: ['fundraising.campaign', campaign.id], detail: { step } })
}

/** The task (every 15 minutes): published drafts open at their time, open campaigns close at theirs. */
export async function openAndCloseDue(unit: UnitView): Promise<void> {
  const at = nowMs()
  const due = await all<{ id: string, state: 'draft' | 'open' }>(
    `SELECT id, state FROM fundraising_campaigns WHERE (state = 'draft' AND published_at IS NOT NULL AND opens_at <= ?)
      OR (state = 'open' AND closes_at IS NOT NULL AND closes_at <= ?)`, at, at)
  for (const c of due) {
    if (c.state === 'draft') open(unit, c.id, 'draft', at)
    else close(unit, c.id, at)
  }
}

/** K2: the first gift that takes raised to the target marks it once and tells the campaign's people. */
export async function markTargetReached(unit: UnitView, campaignId: string): Promise<void> {
  const c = await first<{ title: string, target: number | null, raised: number, reached: number | null, createdBy: string, currency: string }>(
    `SELECT c.title, c.target_minor AS target, ${RAISED} AS raised, c.target_reached_at AS reached, c.created_by AS createdBy, c.currency
      FROM fundraising_campaigns c WHERE c.id = ?`, campaignId)
  if (!c || c.target === null || c.reached !== null || c.raised < c.target) return
  unit.add({ sql: 'UPDATE fundraising_campaigns SET target_reached_at = ? WHERE id = ? AND target_reached_at IS NULL', params: [nowMs(), campaignId] })
    .expect(1, { code: 'fundraising.campaign.target-marked', reason: 'The target was already marked as reached.' })
  unit.announce('fundraising.campaign.target-reached', { campaignId }, { record: ['fundraising.campaign', campaignId] })
  const to = [...new Set([c.createdBy, ...await holdersOf('fundraising.campaign.manage')])]
  const variables = { campaign: c.title, target: await amountWords(c.target, c.currency) }
  await notify(unit, 'fundraising.campaign-target-reached', { to, variables, dedupeKey: campaignId, subject: ['fundraising.campaign', campaignId] })
}
