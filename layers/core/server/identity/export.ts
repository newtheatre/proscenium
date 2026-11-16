// Download my data (ID-15; part 3, "Export and erasure"). The download holds, for one account, every
// row the data-class registry can find (the same matching as erasure, through the account scope and
// the person's verified addresses) and whatever each module's core.export-contributor adds, in open
// formats (JSON, and the contributors' own files) with a readable index. It is built by a job,
// stored as a file on the account that only the person can read, announced by email, and removed
// by the files sweep after core.privacy.export-lifetime.
import { all, newId, nowMs, refuse, usePoint, useSetting, type Actor, type UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import type { TableMeta } from '#kit/db'
import type { ExportContributor, ExportPart } from '../points/export-contributor'
import { storeFile } from '../files/service'
import { notify } from '../notifications/notify'
import { accountById, canonicalAccount, verifiedAddressesOf } from './accounts'
import { bound, matchOf } from './erasure'
import { privacyReady, requestById } from './data-requests'
import { zip, type ZipEntry } from './zip'

export const DOWNLOAD_SLOT = 'core.data-download'

/** Dates in the download are the theatre's; before setup has set its zone, they are UTC. */
async function zone(): Promise<string> {
  return (await useSetting('core.locale.time-zone') as string | null) ?? 'UTC'
}

/**
 * Columns never put in a download, whatever their class: special category data (a module that
 * holds some adds it, opened, through its contributor), anything kept encrypted, and secrets the
 * person could not use and nobody should copy: hashes, keys, tokens and the like.
 */
const SECRET = /(^|_)(hash|secret|token|key|nonce|challenge|signature|counter|sealed)(_|$)/ // not-policy: names of secrets

export interface ExportTable { table: string, module: string, match: string, columns: string[] }

/** What the download reads from each table: the person's rows, and the columns worth giving them. */
export function exportPlan(): ExportTable[] {
  const registry = useRegistry().tables as Map<string, { module: string, meta: TableMeta }>
  const tables = new Map<string, TableMeta>()
  for (const [name, { meta }] of registry) tables.set(name, meta)
  const out: ExportTable[] = []
  for (const [name, { module, meta }] of registry) {
    const match = matchOf(meta, tables)
    if (!match) continue
    const columns = Object.values(meta.columns)
      .filter(c => c.meta.class !== 'special' && !c.meta.encrypted && !SECRET.test(c.sql))
      .map(c => c.sql)
    if (columns.length) out.push({ table: name, module, match, columns })
  }
  return out.sort((a, b) => a.module.localeCompare(b.module) || a.table.localeCompare(b.table))
}

const STYLE = 'body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:.4rem;text-align:left}' // not-policy: the index page's layout

const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The readable index: what each file is, and how many rows it holds. */
function indexPage(theatre: string, made: string, files: { path: string, what: string, rows?: number }[]): string {
  const items = files.map(f => `<tr><td><a href="${escape(f.path)}">${escape(f.path)}</a></td><td>${escape(f.what)}</td><td>${f.rows ?? ''}</td></tr>`).join('\n')
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><title>Your data from ${escape(theatre)}</title>
<style>${STYLE}</style>
</head><body>
<h1>Your data from ${escape(theatre)}</h1>
<p>Made on ${escape(made)}. Each file below holds the records about you in one place, as JSON, which any text editor opens. Records that are not linked to your account are searched for by a person and may follow separately.</p>
<table><thead><tr><th>File</th><th>What it holds</th><th>Records</th></tr></thead><tbody>
${items}
</tbody></table>
</body></html>
`
}

/** Builds the download's bytes for one account. */
export async function buildExport(accountId: string, at = nowMs()): Promise<Uint8Array> {
  const emails = await verifiedAddressesOf(accountId)
  const params = [accountId, JSON.stringify(emails)]
  const entries: ZipEntry[] = []
  const listed: { path: string, what: string, rows?: number }[] = []

  for (const t of exportPlan()) {
    const { sql, params: bind } = bound(`SELECT ${t.columns.map(c => `"${c}"`).join(', ')} FROM "${t.table}" WHERE ${t.match}`, params)
    const rows = await all<Record<string, unknown>>(sql, ...bind)
    if (!rows.length) continue
    const path = `records/${t.module}/${t.table}.json`
    entries.push({ name: path, bytes: JSON.stringify(rows, null, 2) })
    listed.push({ path, what: `${t.table.replaceAll('_', ' ')} (${t.module})`, rows: rows.length })
  }

  for (const { module, value } of await usePoint<ExportContributor>('core.export-contributor') as { module: string, value: ExportContributor }[]) {
    for (const part of await value.export({ accountId, emails }) as ExportPart[]) {
      const path = `more/${module}/${part.path}`
      entries.push({ name: path, bytes: part.bytes })
      listed.push({ path, what: part.title })
    }
  }

  const theatre = await useSetting('core.site.name') as string | null ?? 'the theatre'
  const made = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: await zone() }).format(at)
  return zip([{ name: 'index.html', bytes: indexPage(theatre, made, listed) }, ...entries], new Date(at))
}

/** Asks for a download (ID-15). The person has re-asserted already; the job builds it. */
export async function requestExport(unit: UnitView, actor: Actor, accountId: string): Promise<{ id: string }> {
  if (!(await privacyReady())) refuse('core.privacy.contact-unset', 'Downloads are not available yet.', { status: 409, remedy: 'The theatre needs to say who to contact about personal data first.' })
  const account = await accountById(accountId)
  if (!account || account.anonymised_at || account.merged_into_id) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const at = nowMs()
  const respondWithin = await useSetting('core.privacy.respond-within') as number
  const id = newId('dreq')
  // One download at a time: the insert holds the rule, so two quick clicks cannot both start one.
  unit.add({
    sql: `INSERT INTO core_data_requests (id, account_id, kind, state, requested_by, requested_at, respond_by)
          SELECT ?, ?, 'export', 'running', ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM core_data_requests WHERE account_id = ? AND kind = 'export' AND state = 'running')`,
    params: [id, account.id, actor.accountId!, at, at + respondWithin * 1000, account.id], // not-policy: seconds to milliseconds
  }).expect(1, { code: 'core.data-request.open', reason: 'Your download is already being made.', remedy: 'You will get an email when it is ready.' })
  unit.enqueue('core.build-export', { requestId: id })
  unit.audit({ action: 'create', record: ['core.data-request', id], detail: { kind: 'export' } })
  return { id }
}

/** The job: builds the download, stores it on the account, finishes the request and tells the person. */
export async function runExport(unit: UnitView, requestId: string): Promise<void> {
  const request = await requestById(requestId)
  if (!request || request.kind !== 'export' || request.state !== 'running') return
  const account = await accountById(request.account_id)
  if (!account || account.anonymised_at) {
    unit.add({ sql: 'UPDATE core_data_requests SET state = \'cancelled\', finished_at = ? WHERE id = ? AND state = \'running\'', params: [nowMs(), requestId] })
    return
  }
  const accountId = await canonicalAccount(account.id)
  const at = nowMs()
  const lifetime = await useSetting('core.privacy.export-lifetime') as number
  const expiresAt = at + lifetime * 1000 // not-policy: seconds to milliseconds
  const bytes = await buildExport(accountId, at)
  const fileId = await storeFile(unit, { slot: DOWNLOAD_SLOT, ownerType: 'core.account', ownerId: accountId, bytes, mediaType: 'application/zip', title: 'Your data', expiresAt })
  unit.add({ sql: 'UPDATE core_data_requests SET state = \'done\', file_id = ?, finished_at = ? WHERE id = ? AND state = \'running\'', params: [fileId, at, requestId] }).expect(1)
  const until = new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: await zone() }).format(expiresAt)
  await notify(unit, 'core.export-ready', { to: accountId, variables: { until }, dedupeKey: requestId })
  unit.announce('core.data-request.finished', { requestId, kind: 'export' }, { record: ['core.data-request', requestId] })
}
