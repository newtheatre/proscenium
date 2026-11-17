// Importing last year's members from a file (MEM-49). A file has up to four columns: the email
// address, the name, the start date and the end date; either date may be left empty, and the scheme's
// rule then decides. A dry run reports the rows that would be refused; the import itself runs as bulk
// jobs, a share of rows each, finding or creating each account through findOrCreateAccount. A row for
// the importer's own account, or for somebody who already holds the scheme on that day, is refused.
import { all, first, nowMs, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount } from '#modules/core'
import { endsOnFor } from './dates'
import { cells, dateOf } from './lists'
import { holdsScheme, writeActive } from './memberships'
import { requireScheme, type Scheme } from './schemes'

export interface ImportRow { line: number, address: string, name: string | null, startsOn: string | null, endsOn: string | null }
export type ImportRefusal = 'not-an-address' | 'bad-date' | 'repeated' | 'dates' | 'own-account' | 'already-held'

/** The most rows one file may carry. */
export const MOST_ROWS = 5000 // not-policy: what one request body and its jobs carry; a larger file is split by hand
/** Rows per bulk job: each finds or creates an account and writes a membership, within one unit. */
export const ROWS_PER_JOB = 20 // not-policy: a share that fits core.units.statement-limit

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Reads the file: rows that can be read, and each refused line with why. Headings on the first line are skipped. */
export function parseMembers(text: string): { rows: ImportRow[], refused: { line: number, reason: ImportRefusal }[] } {
  const rows: ImportRow[] = []
  const refused: { line: number, reason: ImportRefusal }[] = []
  const seen = new Set<string>()
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    const line = index + 1
    const [first = '', second = '', third = '', fourth = ''] = cells(raw)
    const address = first.trim().toLowerCase()
    if (!ADDRESS.test(address) || address.length > 254) { // not-policy: an address's bound
      if (index === 0) return // headings
      refused.push({ line, reason: 'not-an-address' })
      return
    }
    const startsOn = dateOf(third)
    const endsOn = dateOf(fourth)
    if (startsOn === undefined || endsOn === undefined) return void refused.push({ line, reason: 'bad-date' })
    if (startsOn && endsOn && endsOn < startsOn) return void refused.push({ line, reason: 'dates' })
    if (seen.has(address)) return void refused.push({ line, reason: 'repeated' })
    seen.add(address)
    rows.push({ line, address, name: second.trim().slice(0, 120) || null, startsOn, endsOn }) // not-policy: the specification's bound on a name
  })
  return { rows, refused }
}

/** The account an address already belongs to, as its survivor, or null. */
async function accountFor(address: string): Promise<string | null> {
  const row = await first<{ id: string }>('SELECT coalesce(a.merged_into_id, a.id) AS id FROM core_account_emails e JOIN core_accounts a ON a.id = e.account_id WHERE e.address = ? AND a.anonymised_at IS NULL', address)
  return row?.id ?? null
}

/** Why a readable row cannot be imported now, or null. Reads only. */
export async function refusalFor(scheme: Scheme, row: ImportRow, importerId: string | null, day: string): Promise<ImportRefusal | null> {
  const accountId = await accountFor(row.address)
  if (!accountId) return null
  if (importerId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, importerId)) return 'own-account'
  if (await holdsScheme(accountId, scheme.id, row.startsOn ?? day)) return 'already-held'
  return null
}

/** The rows that would import, and those refused, without writing anything. */
export async function checkRows(scheme: Scheme, rows: ImportRow[], importerId: string | null, day: string) {
  const ready: ImportRow[] = []
  const refused: { line: number, reason: ImportRefusal }[] = []
  for (const row of rows) {
    const reason = await refusalFor(scheme, row, importerId, day)
    if (reason) refused.push({ line: row.line, reason })
    else ready.push(row)
  }
  return { ready, refused }
}

export interface ImportJob { importId: string, schemeId: string, importedBy: string | null, day: string, rows: ImportRow[] }

/** One bulk job's share: each row checked again, its account found or made, its membership written. */
export async function importShare(unit: UnitView, job: ImportJob): Promise<{ imported: number, skipped: number }> {
  const scheme = await requireScheme(job.schemeId)
  const options = await all<{ id: string, count: number }>("SELECT id, count FROM membership_length_options WHERE scheme_id = ? AND state = 'offered' ORDER BY count", scheme.id)
  const option = options[0] ?? null
  let imported = 0
  let skipped = 0
  for (const row of job.rows) {
    // Checked again: the file was read a while ago, and a job may run twice.
    if (await refusalFor(scheme, row, job.importedBy, job.day)) {
      skipped++
      continue
    }
    const { accountId } = await findOrCreateAccount(unit, { address: row.address, name: row.name ?? undefined, origin: 'staff' })
    const startsOn = row.startsOn ?? job.day
    const endsOn = row.endsOn ?? endsOnFor(scheme, startsOn, option?.count ?? 1)
    await writeActive(unit, { scheme, accountId, origin: 'added', lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn, endsOn, addedBy: job.importedBy, note: null })
    imported++
  }
  unit.audit({ action: 'create', record: ['membership.scheme', scheme.id], detail: { importId: job.importId, imported, skipped, at: nowMs() } })
  return { imported, skipped }
}
