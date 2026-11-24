// Export profiles and their code maps (part 2; IE-02). A profile is made from one of two starting
// layouts and changed field by field; each code change is audited with the old and new code (E-14).
// The map digest fingerprints everything that shapes a file, so a run can say whether it would differ.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { ledgerAccounts, type PostingKind } from '#modules/finance'
import { journalColumns, STARTER_PROFILES, type ExportColumn, type ProfileLayout, type Starter } from '../shared/exports'

export interface Profile extends ProfileLayout {
  id: string
  name: string
  archivedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface CodeRow {
  id: string
  accountId: string
  postingKind: PostingKind | null
  code: string | null
  codeName: string
  updatedAt: number
}

interface ProfileRow {
  id: string
  name: string
  format: ProfileLayout['format']
  granularity: ProfileLayout['granularity']
  columns: string
  date_format: ProfileLayout['dateFormat']
  signs: ProfileLayout['signs']
  split_by: ProfileLayout['splitBy']
  total_line: string
  total_label: string
  tax_map: string
  kind_labels: string
  unmapped_code: string
  period_rule: ProfileLayout['periodRule']
  archived_at: number | null
  created_at: number
  updated_at: number
}

const NOT_FOUND = { code: 'invoicing.profile.not-found', reason: 'There is no such export profile.' }

function fromRow(r: ProfileRow): Profile {
  return {
    id: r.id,
    name: r.name,
    format: r.format,
    granularity: r.granularity,
    columns: JSON.parse(r.columns) as ExportColumn[],
    dateFormat: r.date_format,
    signs: r.signs,
    splitBy: r.split_by,
    totalLine: r.total_line,
    totalLabel: r.total_label,
    taxMap: JSON.parse(r.tax_map) as Record<string, string>,
    kindLabels: JSON.parse(r.kind_labels) as Record<string, string>,
    unmappedCode: r.unmapped_code,
    periodRule: r.period_rule,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getProfile(id: string): Promise<Profile> {
  const row = await first<ProfileRow>('SELECT * FROM invoicing_export_profiles WHERE id = ?', id)
  if (!row) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 })
  return fromRow(row!)
}

export async function listProfiles(): Promise<Profile[]> {
  return (await all<ProfileRow>('SELECT * FROM invoicing_export_profiles ORDER BY archived_at IS NOT NULL, name')).map(fromRow)
}

/** The columns a file has: the format's own layout, or the custom profile's choice. */
export function columnsOf(profile: ProfileLayout): ExportColumn[] {
  return profile.format === 'journal' ? journalColumns(profile.signs) : profile.columns
}

async function refuseTakenName(name: string, except?: string): Promise<void> {
  const taken = await first('SELECT 1 FROM invoicing_export_profiles WHERE name = ? AND id IS NOT ?', name, except ?? null)
  if (taken) refuse('invoicing.profile.name-taken', 'Another export profile has that name.', { status: 409, fields: { name: 'invoicing.profile.name-taken' } })
}

function refuseBadLayout(layout: ProfileLayout): void {
  if (layout.format === 'custom' && layout.columns.length === 0)
    refuse('invoicing.profile.no-columns', 'A custom profile needs at least one column.', { status: 422, fields: { columns: 'invoicing.profile.no-columns' } })
}

/** Makes a profile from a starting layout, every account unmapped. */
export async function createProfile(unit: UnitView, input: { starter: Starter, name?: string }): Promise<string> {
  const { name: starterName, ...layout } = STARTER_PROFILES[input.starter]
  const name = input.name ?? starterName
  await refuseTakenName(name)
  const id = newId('ivx')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO invoicing_export_profiles (id, name, format, granularity, columns, date_format, signs, split_by, total_line, total_label, tax_map, kind_labels, unmapped_code, period_rule, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, name, layout.format, layout.granularity, JSON.stringify(layout.columns), layout.dateFormat, layout.signs, layout.splitBy, layout.totalLine, layout.totalLabel,
      JSON.stringify(layout.taxMap), JSON.stringify(layout.kindLabels), layout.unmappedCode, layout.periodRule, at, at],
  })
  unit.audit({ action: 'create', record: ['invoicing.export-profile', id], detail: { starter: input.starter } })
  return id
}

const COLUMN_OF: Record<keyof ProfileLayout | 'name', string> = {
  name: 'name', format: 'format', granularity: 'granularity', columns: 'columns', dateFormat: 'date_format', signs: 'signs', splitBy: 'split_by',
  totalLine: 'total_line', totalLabel: 'total_label', taxMap: 'tax_map', kindLabels: 'kind_labels', unmappedCode: 'unmapped_code', periodRule: 'period_rule',
}
const JSON_FIELDS = new Set(['columns', 'taxMap', 'kindLabels'])

/** Changes a profile's fields; the audit row names the fields changed. */
export async function updateProfile(unit: UnitView, id: string, patch: Partial<ProfileLayout & { name: string, archived: boolean }>): Promise<void> {
  const before = await getProfile(id)
  const { archived, ...fields } = patch
  const next = { ...before, ...fields }
  if (fields.name !== undefined && fields.name !== before.name) await refuseTakenName(fields.name, id)
  refuseBadLayout(next)
  if (fields.totalLine !== undefined && !['none', 'net'].includes(fields.totalLine)) {
    const money = await moneyAccounts()
    if (!money.some(a => a.code === fields.totalLine))
      refuse('invoicing.profile.total-line', 'The total line is none, the net of every money account, or one money account\'s code.', { status: 422, fields: { totalLine: 'invoicing.profile.total-line' } })
  }
  const sets: string[] = []
  const params: unknown[] = []
  const changed: string[] = []
  for (const [key, value] of Object.entries(fields) as [keyof typeof COLUMN_OF, unknown][]) {
    const old = before[key as keyof Profile]
    if (JSON.stringify(old) === JSON.stringify(value)) continue
    sets.push(`${COLUMN_OF[key]} = ?`)
    params.push(JSON_FIELDS.has(key) ? JSON.stringify(value) : value)
    changed.push(key)
  }
  if (archived !== undefined && archived !== (before.archivedAt !== null)) {
    sets.push('archived_at = ?')
    params.push(archived ? nowMs() : null)
    changed.push('archived')
  }
  if (!sets.length) return
  unit.add({ sql: `UPDATE invoicing_export_profiles SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, params: [...params, nowMs(), id] }).expect(1)
  unit.audit({ action: 'update', record: ['invoicing.export-profile', id], detail: { fields: changed } })
}

export async function codesOf(profileId: string): Promise<CodeRow[]> {
  const rows = await all<{ id: string, account_id: string, posting_kind: PostingKind | null, code: string | null, code_name: string, updated_at: number }>(
    'SELECT id, account_id, posting_kind, code, code_name, updated_at FROM invoicing_export_codes WHERE profile_id = ? ORDER BY account_id, posting_kind IS NOT NULL, posting_kind', profileId)
  return rows.map(r => ({ id: r.id, accountId: r.account_id, postingKind: r.posting_kind, code: r.code, codeName: r.code_name, updatedAt: r.updated_at }))
}

/**
 * Sets the other books' code for an account, or for one kind of posting on it (E-06). A null code
 * marks it explicitly unmapped; `remove` takes a kind's own code away, so the account's applies again.
 */
export async function setCode(unit: UnitView, input: { profileId: string, accountId: string, postingKind: PostingKind | null, code: string | null, codeName: string, remove?: boolean, by: string | null }): Promise<void> {
  await getProfile(input.profileId)
  const accounts = await ledgerAccounts()
  if (!accounts.some(a => a.id === input.accountId)) refuse('invoicing.profile.no-account', 'There is no such ledger account.', { status: 404 })
  const existing = await first<{ id: string, code: string | null, code_name: string }>(
    "SELECT id, code, code_name FROM invoicing_export_codes WHERE profile_id = ? AND account_id = ? AND coalesce(posting_kind, '') = ?", input.profileId, input.accountId, input.postingKind ?? '')
  const record = ['invoicing.export-profile', input.profileId] as const
  const detail = { accountId: input.accountId, postingKind: input.postingKind }
  if (input.remove) {
    if (!existing) return
    unit.add({ sql: 'DELETE FROM invoicing_export_codes WHERE id = ?', params: [existing.id] }).expect(1)
    unit.audit({ action: 'update', record, detail: { ...detail, before: existing.code, after: null, removed: true } })
    return
  }
  if (existing && existing.code === input.code && existing.code_name === input.codeName) return
  const at = nowMs()
  if (existing) unit.add({ sql: 'UPDATE invoicing_export_codes SET code = ?, code_name = ?, updated_by = ?, updated_at = ? WHERE id = ?', params: [input.code, input.codeName, input.by, at, existing.id] }).expect(1)
  else unit.add({
    sql: 'INSERT INTO invoicing_export_codes (id, profile_id, account_id, posting_kind, code, code_name, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('ivm'), input.profileId, input.accountId, input.postingKind, input.code, input.codeName, input.by, at],
  })
  unit.add({ sql: 'UPDATE invoicing_export_profiles SET updated_at = ? WHERE id = ?', params: [at, input.profileId] })
  unit.audit({ action: 'update', record, detail: { ...detail, before: existing?.code ?? null, after: input.code } })
}

/** Payments' money accounts: what the tender column calls money and the total line adds up. */
export async function moneyAccounts() {
  return (await ledgerAccounts()).filter(a => isMoney(a))
}

export function isMoney(account: { systemKey: string | null, kind: string }): boolean {
  return account.kind === 'asset' && !!account.systemKey?.startsWith('payments.')
}

/** The SHA-256 of text's UTF-8 bytes, in hex. */
export async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: bytes as hex
}

/** A digest of the profile's layout and its codes: equal digests over a closed range give the same file. */
export async function mapDigest(profile: Profile, codes: CodeRow[]): Promise<string> {
  const layout: Record<string, unknown> = {}
  for (const key of Object.keys(COLUMN_OF).sort()) if (key !== 'name') layout[key] = profile[key as keyof Profile]
  const map = codes.map(c => [c.accountId, c.postingKind ?? '', c.code, c.codeName]).sort((a, b) => String(a).localeCompare(String(b)))
  return await fingerprint(JSON.stringify({ layout, map }))
}
