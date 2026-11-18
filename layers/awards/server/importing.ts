// Importing past awards from a file. A file has up to five columns: the name on the award, the date
// it was awarded (a date, or a year alone, kept as 1 January and shown as the year), what it was for, the citation, and
// the holder's email address. Without an address the award is recorded by name alone and can be
// linked to an account later; with one, the account is found or made. A dry run reports the rows
// that would be refused; the import itself runs as bulk jobs, a share of rows each. Nobody is told:
// these are awards already given.
import { first, nowMs, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount } from '#modules/core'
import { holdsType, startingVisibility, writeAward } from './awards'
import { requireType, type AwardType } from './types'

export interface ImportRow { line: number, name: string, awardedOn: string, /** Absent in a job queued before it was kept: the day. */ awardedPrecision?: 'day' | 'year', awardedFor: string | null, citation: string | null, address: string | null }
export type ImportRefusal = 'no-name' | 'bad-date' | 'not-an-address' | 'repeated' | 'own-account' | 'already-held' | 'already-recorded'

/** The most rows one file may carry. */
export const MOST_ROWS = 2000 // not-policy: what one request body and its jobs carry; a larger file is split by hand
/** Rows per bulk job: each may find or create an account and writes an award, within one unit. */
export const ROWS_PER_JOB = 20 // not-policy: a share that fits core.units.statement-limit

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ISO = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date
const UK = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/ // not-policy: the shape of a date
const YEAR = /^\d{4}$/ // not-policy: the shape of a year

/** "2004-06-01", "1/6/2004" or "2004" as a date; undefined when it is none of them or does not exist. */
export function dateOf(text: string): string | undefined {
  const t = text.trim()
  const uk = UK.exec(t)
  const iso = ISO.test(t) ? t : uk ? `${uk[3]}-${uk[2]!.padStart(2, '0')}-${uk[1]!.padStart(2, '0')}` : YEAR.test(t) ? `${t}-01-01` : null
  const parsed = iso ? new Date(`${iso}T00:00:00Z`) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso!) ? iso! : undefined
}

/** Whether a cell is a year alone. */
export const yearOnly = (text: string): boolean => YEAR.test(text.trim())

/** Splits a file into rows of cells, honouring double quotes, which may hold commas and new lines. */
export function table(text: string): { line: number, cells: string[] }[] {
  const out: { line: number, cells: string[] }[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let startedAt = 1
  const endRow = () => {
    cells.push(cell)
    if (cells.some(c => c.trim())) out.push({ line: startedAt, cells })
    cells = []
    cell = ''
  }
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\n') line++
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (c === '"') quoted = false
      else cell += c
    }
    else if (c === '"') quoted = true
    else if (c === ',') {
      cells.push(cell)
      cell = ''
    }
    else if (c === '\n') {
      endRow()
      startedAt = line
    }
    else cell += c
  }
  endRow()
  return out
}

/** Reads the file: rows that can be read, and each refused line with why. Headings on the first line are skipped. */
export function parseAwards(text: string): { rows: ImportRow[], refused: { line: number, reason: ImportRefusal }[] } {
  const rows: ImportRow[] = []
  const refused: { line: number, reason: ImportRefusal }[] = []
  const seen = new Set<string>()
  table(text).forEach(({ line, cells }, index) => {
    const [first = '', second = '', third = '', fourth = '', fifth = ''] = cells
    const name = first.trim().slice(0, 120) // not-policy: the bound on a name
    const awardedOn = dateOf(second)
    if (!awardedOn) {
      if (index === 0) return // headings
      return void refused.push({ line, reason: 'bad-date' })
    }
    if (!name) return void refused.push({ line, reason: 'no-name' })
    const address = fifth.trim().toLowerCase() || null
    if (address && (!ADDRESS.test(address) || address.length > 254)) return void refused.push({ line, reason: 'not-an-address' }) // not-policy: an address's bound
    const key = `${name.toLowerCase()}|${awardedOn}`
    if (seen.has(key)) return void refused.push({ line, reason: 'repeated' })
    seen.add(key)
    rows.push({ line, name, awardedOn, awardedPrecision: yearOnly(second) ? 'year' : 'day', awardedFor: third.trim().slice(0, 200) || null, citation: fourth.trim().slice(0, 2000) || null, address }) // not-policy: the bounds on the two texts
  })
  return { rows, refused }
}

/** The account an address already belongs to, as its survivor, or null. */
async function accountFor(address: string): Promise<string | null> {
  const row = await first<{ id: string }>('SELECT coalesce(a.merged_into_id, a.id) AS id FROM core_account_emails e JOIN core_accounts a ON a.id = e.account_id WHERE e.address = ? AND a.anonymised_at IS NULL', address)
  return row?.id ?? null
}

/** Why a readable row cannot be imported now, or null. Reads only. */
export async function refusalFor(type: AwardType, row: ImportRow, importerId: string | null): Promise<ImportRefusal | null> {
  if (await first('SELECT 1 FROM awards_awards WHERE type_id = ? AND state = \'current\' AND awarded_on = ? AND lower(recipient_name) = lower(?)', type.id, row.awardedOn, row.name)) return 'already-recorded'
  const accountId = row.address ? await accountFor(row.address) : null
  if (!accountId) return null
  if (importerId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, importerId)) return 'own-account'
  if (type.onePerPerson && await holdsType(accountId, type.id)) return 'already-held'
  return null
}

/** The rows that would import, and those refused, without writing anything. */
export async function checkRows(type: AwardType, rows: ImportRow[], importerId: string | null) {
  const ready: ImportRow[] = []
  const refused: { line: number, reason: ImportRefusal }[] = []
  const addresses = new Set<string>()
  for (const row of rows) {
    // One address twice in a file would give one person a once-only award twice.
    const reason = type.onePerPerson && row.address && addresses.has(row.address) ? 'repeated' : await refusalFor(type, row, importerId)
    if (reason) refused.push({ line: row.line, reason })
    else ready.push(row)
    if (row.address) addresses.add(row.address)
  }
  return { ready, refused }
}

export interface ImportJob { importId: string, typeId: string, importedBy: string | null, rows: ImportRow[] }

/** One bulk job's share: each row checked again, its account found or made if it has an address, its award written. */
export async function importShare(unit: UnitView, job: ImportJob): Promise<{ imported: number, skipped: number }> {
  const type = await requireType(job.typeId)
  let imported = 0
  let skipped = 0
  const given = new Set<string>()
  for (const row of job.rows) {
    // Checked again: the file was read a while ago, and a job may run twice.
    if (type.state !== 'active' || await refusalFor(type, row, job.importedBy)) {
      skipped++
      continue
    }
    const found = row.address ? await findOrCreateAccount(unit, { address: row.address, name: row.name, origin: 'staff' }) : null
    const accountId = found?.accountId ?? null
    if (accountId && type.onePerPerson && given.has(accountId)) {
      skipped++
      continue
    }
    if (accountId) given.add(accountId)
    writeAward(unit, { type, accountId, recipientName: row.name, awardedOn: row.awardedOn, awardedPrecision: row.awardedPrecision, awardedFor: row.awardedFor, citation: row.citation, visibility: await startingVisibility(type, accountId, found?.claimed), source: 'import', issuedBy: job.importedBy })
    imported++
  }
  unit.audit({ action: 'create', record: ['awards.type', type.id], detail: { importId: job.importId, imported, skipped, at: nowMs() } })
  return { imported, skipped }
}
