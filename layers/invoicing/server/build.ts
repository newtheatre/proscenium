// Taking an export (part 3, rules E-01 to E-11, E-15): what a range covers, and the file itself, read
// from Finance's sealed entries through entryRows and never from Finance's tables. Every download is
// recorded as a run with the map digest and the file's SHA-256, so a closed range taken twice is
// shown to be the same file (E-09).
import { all, first, newId, nowMs, refuse, theatreTimeZone, today, useSetting, type UnitView } from '#kit'
import { entryCounts, entryRows, ledgerAccounts, listPeriods, rangeClosed, rangeOf, ENTRY_PAGE_MAX, type EntryRow } from '#modules/finance'
import { previousDate } from '#kit/clock'
import { AMOUNT_COLUMNS, type ColumnKey, type ExportColumn } from '../shared/exports'
import { codesOf, columnsOf, fingerprint, getProfile, isMoney, mapDigest, type CodeRow, type Profile } from './profiles'

/** The most entries one export takes, as Finance's own export (E-07). */
export const EXPORT_CEILING = 50_000 // not-policy: a size one Worker response builds comfortably

export interface Coverage {
  from: string
  to: string
  lines: number
  unmappedLines: number
  unmappedAccounts: { id: string, code: string, name: string, lines: number }[]
  closed: boolean
}

type Lookup = (accountId: string, kind: string) => { code: string | null, codeName: string }

/** A code by account and posting kind first, then by account alone (E-06). */
function lookupOf(codes: CodeRow[]): Lookup {
  const byKey = new Map(codes.map(c => [`${c.accountId}|${c.postingKind ?? ''}`, c]))
  return (accountId, kind) => {
    const row = byKey.get(`${accountId}|${kind}`) ?? byKey.get(`${accountId}|`)
    return { code: row?.code ?? null, codeName: row?.codeName ?? '' }
  }
}

function hasKindCode(codes: CodeRow[]): (accountId: string, kind: string) => boolean {
  const kinds = new Set(codes.filter(c => c.postingKind).map(c => `${c.accountId}|${c.postingKind}`))
  return (accountId, kind) => kinds.has(`${accountId}|${kind}`)
}

function refuseBackwards(from: string, to: string): void {
  if (to < from) refuse('invoicing.export.backwards', 'The last day is before the first.', { status: 422, fields: { to: 'invoicing.export.backwards' } })
}

/** The range a profile's period rule opens on: the finance year so far, the latest closed period, or this month so far. */
export async function openingRange(profile: Profile): Promise<{ from: string, to: string }> {
  const now = await today()
  if (profile.periodRule === 'finance-year') {
    const starts = await useSetting('finance.year.starts') as string
    const thisYear = `${now.slice(0, 4)}-${starts}`
    const from = thisYear <= now ? thisYear : `${Number(now.slice(0, 4)) - 1}-${starts}`
    const next = `${Number(from.slice(0, 4)) + 1}-${starts}`
    return { from, to: previousDate(next) }
  }
  if (profile.periodRule === 'period') {
    const closed = (await listPeriods()).filter(p => p.closed && p.endsOn <= now).at(-1)
    if (closed) return { from: closed.startsOn, to: closed.endsOn }
  }
  return { from: `${now.slice(0, 7)}-01`, to: now }
}

/** What a file would hold, before it is taken (E-05, E-07, E-08). */
export async function coverage(profile: Profile, from: string, to: string): Promise<Coverage> {
  refuseBackwards(from, to)
  const [counts, codes, accounts, closed] = await Promise.all([entryCounts(await rangeOf(from, to)), codesOf(profile.id), ledgerAccounts(), rangeClosed(from, to)])
  const lookup = lookupOf(codes)
  const byId = new Map(accounts.map(a => [a.id, a]))
  const unmapped = new Map<string, number>()
  let lines = 0
  let unmappedLines = 0
  for (const c of counts) {
    lines += c.entries
    if (lookup(c.accountId, c.kind).code !== null) continue
    unmappedLines += c.entries
    unmapped.set(c.accountId, (unmapped.get(c.accountId) ?? 0) + c.entries)
  }
  const unmappedAccounts = [...unmapped].map(([id, n]) => ({ id, code: byId.get(id)?.code ?? '', name: byId.get(id)?.name ?? '', lines: n })).sort((a, b) => a.code.localeCompare(b.code))
  return { from, to, lines, unmappedLines, unmappedAccounts, closed }
}

function refuseCeiling(lines: number): void {
  if (lines > EXPORT_CEILING)
    refuse('invoicing.export.too-long', `That range holds ${lines} lines, more than one export takes.`, { status: 422, remedy: 'Export a shorter range, such as one period at a time.' })
}

async function readEntries(from: string, to: string): Promise<EntryRow[]> {
  const range = await rangeOf(from, to)
  const out: EntryRow[] = []
  for (;;) {
    const page = await entryRows(range, { afterId: out.at(-1)?.entryId, limit: ENTRY_PAGE_MAX })
    out.push(...page)
    if (page.length < ENTRY_PAGE_MAX) return out
  }
}

async function titlesOf(table: 'core_productions' | 'core_performances', ids: Set<string>): Promise<Map<string, string>> {
  if (!ids.size) return new Map()
  const column = table === 'core_productions' ? 'title' : 'starts_at'
  const rows = await all<{ id: string, v: string | number }>(`SELECT id, ${column} AS v FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify([...ids]))
  return new Map(rows.map(r => [r.id, String(r.v)]))
}

const KIND_WORDS: Record<string, string> = {
  sale: 'Sale', refund: 'Refund', fee: 'Fee', payout: 'Payout', recognition: 'Recognition', transfer: 'Transfer',
  cash_variance: 'Cash variance', unfulfilled: 'Unfulfilled', correction: 'Correction', opening: 'Opening balance',
}

/** A cell for the file: amounts as plain numbers, text guarded against formulas (E-10) and quoted where it must be. */
function cell(value: string, amount: boolean): string {
  let text = value
  if (!amount && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

interface Line {
  occurredAt: number | null
  day: string
  posting: string
  kind: string
  kindLabel: string
  accountCode: string
  code: string
  codeName: string
  accountName: string
  money: boolean
  amountMinor: number
  currency: string
  production: string
  performance: string
  source: string
  reference: string
}

export interface BuiltFile {
  csv: string
  rows: number
  unmappedRows: number
}

/** The file: one line per entry or per day, account, code and tag set, then the total line (E-02 to E-04, E-11, E-15). */
export async function buildFile(profile: Profile, from: string, to: string): Promise<BuiltFile> {
  refuseBackwards(from, to)
  const counted = (await entryCounts(await rangeOf(from, to))).reduce((n, c) => n + c.entries, 0)
  refuseCeiling(counted)
  const [entries, codes, accounts, zone] = await Promise.all([readEntries(from, to), codesOf(profile.id), ledgerAccounts(), theatreTimeZone()])
  const lookup = lookupOf(codes)
  const kindCoded = hasKindCode(codes)
  const accountById = new Map(accounts.map(a => [a.id, a]))
  const productions = await titlesOf('core_productions', new Set(entries.map(e => e.productionId).filter((x): x is string => !!x)))
  const performances = await titlesOf('core_performances', new Set(entries.map(e => e.performanceId).filter((x): x is string => !!x)))
  const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const clockOf = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const whenOf = (at: number) => `${dayOf.format(at)} ${clockOf.format(at)}`

  // A posting's label is its kind's, for the module or account it is for: the first entry not on Payments' or Finance's accounts.
  const ownerOf = new Map<string, { module: string, key: string | null }>()
  for (const e of entries) {
    if (ownerOf.has(e.postingId)) continue
    const module = e.forModule ?? e.systemKey?.split('.')[0] ?? e.source.module
    if (module !== 'payments' && module !== 'finance') ownerOf.set(e.postingId, { module, key: e.systemKey })
  }
  const labelOf = (e: EntryRow) => {
    const owner = ownerOf.get(e.postingId) ?? { module: e.source.module, key: null }
    return profile.kindLabels[`${e.kind}:${owner.key}`] ?? profile.kindLabels[`${e.kind}:${owner.module}`] ?? profile.kindLabels[e.kind] ?? KIND_WORDS[e.kind] ?? e.kind
  }

  let lines: Line[] = entries.map((e) => {
    const { code, codeName } = lookup(e.accountId, e.kind)
    return {
      occurredAt: e.occurredAt,
      day: dayOf.format(e.occurredAt),
      posting: e.postingId,
      kind: e.kind,
      kindLabel: labelOf(e),
      accountCode: e.accountCode,
      code: code ?? '',
      codeName: codeName || e.accountName,
      accountName: e.accountName,
      money: isMoney({ systemKey: e.systemKey, kind: e.accountKind }),
      amountMinor: e.amountMinor,
      currency: e.currency,
      production: e.productionId ? productions.get(e.productionId) ?? '' : '',
      performance: e.performanceId && performances.has(e.performanceId) ? whenOf(Number(performances.get(e.performanceId))) : '',
      source: `${e.source.type}:${e.source.id}`,
      reference: e.postingId,
    }
  })
  const unmapped = (l: Line) => l.code === ''

  if (profile.granularity === 'daily') {
    // One line per day, account, code (a kind's own code keeps its kind apart) and tag set (E-03).
    const groups = new Map<string, Line>()
    entries.forEach((e, i) => {
      const l = lines[i]!
      const kind = kindCoded(e.accountId, e.kind) ? e.kind : ''
      const tag = profile.splitBy === 'production' ? l.production : profile.splitBy === 'source-module' ? e.source.module : ''
      const key = [l.day, e.accountId, kind, tag, l.currency].join('\t')
      const group = groups.get(key)
      if (group) group.amountMinor += l.amountMinor
      else groups.set(key, { ...l, occurredAt: null, posting: l.day, kind, kindLabel: kind ? l.kindLabel : '', production: profile.splitBy === 'production' ? tag : '', performance: '', source: profile.splitBy === 'source-module' ? tag : '', reference: '' })
    })
    lines = [...groups.values()]
  }

  const columns = columnsOf(profile)
  const decimals = (currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const major = (minor: number, currency: string) => (minor / 10 ** decimals(currency)).toFixed(decimals(currency)) // not-policy: minor units to major
  const date = (day: string) => {
    const [y, m, d] = day.split('-')
    return profile.dateFormat === 'dmy' ? `${d}/${m}/${y}` : profile.dateFormat === 'mdy' ? `${m}/${d}/${y}` : day
  }
  const signed = (minor: number) => (profile.signs === 'credit' ? -minor : minor)
  const value = (l: Line, key: ColumnKey): string => {
    switch (key) {
      case 'date': return date(l.day)
      case 'day': return l.day
      case 'time': return l.occurredAt === null ? '' : clockOf.format(l.occurredAt)
      case 'posting': return l.posting
      case 'kind': return l.kind
      case 'kind-label': return l.kindLabel
      case 'account-code': return l.accountCode
      case 'code': return l.code || profile.unmappedCode
      case 'code-name': return l.codeName
      case 'account-name': return l.accountName
      case 'description': return l.accountName
      case 'debit': return l.amountMinor > 0 ? major(l.amountMinor, l.currency) : ''
      case 'credit': return l.amountMinor < 0 ? major(-l.amountMinor, l.currency) : ''
      case 'amount': return major(signed(l.amountMinor), l.currency)
      case 'amount-minor': return String(signed(l.amountMinor))
      case 'currency': return l.currency
      case 'production': return l.production
      case 'performance': return l.performance
      case 'source': return l.source
      case 'money': return l.money ? 'Money' : 'Not money'
      case 'reference': return l.reference
    }
  }
  const rowOf = (cells: (key: ColumnKey) => string) => columns.map((c: ExportColumn) => cell(cells(c.key), AMOUNT_COLUMNS.includes(c.key))).join(',')
  const out = [columns.map(c => cell(c.header, false)).join(',')]
  for (const l of lines) out.push(rowOf(key => value(l, key)))

  // The total line: what the money accounts, or one of them, hold from the range, money in positive (E-04 leaves it out).
  if (profile.totalLine !== 'none') {
    const label = profile.totalLabel || (profile.totalLine === 'net' ? 'Money net' : `Total of ${profile.totalLine}`)
    const labelKey = (['kind-label', 'description', 'account-name', 'code-name'] as const).find(k => columns.some(c => c.key === k)) ?? columns.find(c => !AMOUNT_COLUMNS.includes(c.key))?.key
    const totals = new Map<string, number>()
    for (const e of entries) {
      const account = accountById.get(e.accountId)
      const counts = profile.totalLine === 'net' ? isMoney({ systemKey: e.systemKey, kind: e.accountKind }) : account?.code === profile.totalLine
      if (counts) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amountMinor)
    }
    if (!totals.size) totals.set(entries[0]?.currency ?? await useSetting('core.locale.currency') as string, 0)
    for (const [currency, minor] of [...totals].sort()) {
      out.push(rowOf((key) => {
        if (key === labelKey) return label
        if (key === 'debit') return minor > 0 ? major(minor, currency) : ''
        if (key === 'credit') return minor < 0 ? major(-minor, currency) : ''
        if (key === 'amount') return major(minor, currency)
        if (key === 'amount-minor') return String(minor)
        if (key === 'currency') return currency
        return ''
      }))
    }
  }
  return { csv: `${out.join('\r\n')}\r\n`, rows: lines.length, unmappedRows: lines.filter(unmapped).length }
}

export interface Run {
  id: string
  profileId: string
  from: string
  to: string
  rows: number
  unmappedRows: number
  closed: boolean
  mapVersion: string
  sha256: string
  by: string | null
  createdAt: number
}

interface RunRow { id: string, profile_id: string, from_on: string, to_on: string, rows: number, unmapped_rows: number, closed: number, map_version: string, sha256: string, by: string | null, created_at: number }
const runOf = (r: RunRow): Run => ({ id: r.id, profileId: r.profile_id, from: r.from_on, to: r.to_on, rows: r.rows, unmappedRows: r.unmapped_rows, closed: r.closed === 1, mapVersion: r.map_version, sha256: r.sha256, by: r.by, createdAt: r.created_at })

export async function runsOf(profileId: string, limit = 50): Promise<Run[]> { // not-policy: a screen's worth of past runs
  return (await all<RunRow>('SELECT * FROM invoicing_export_runs WHERE profile_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', profileId, limit)).map(runOf)
}

export async function getRun(id: string): Promise<Run> {
  const row = await first<RunRow>('SELECT * FROM invoicing_export_runs WHERE id = ?', id)
  if (!row) refuse('invoicing.run.not-found', 'There is no such export.', { status: 404 })
  return runOf(row!)
}

export const currentDigest = async (profile: Profile) => mapDigest(profile, await codesOf(profile.id))

/**
 * Takes the file and records the run. `sameAs` is the latest earlier run of the same range whose file
 * had the same bytes, which the screen reports.
 */
export async function takeExport(unit: UnitView, input: { profileId: string, from: string, to: string, by: string | null }): Promise<{ csv: string, run: Run, sameAs: Run | null }> {
  const profile = await getProfile(input.profileId)
  if (profile.archivedAt !== null) refuse('invoicing.profile.archived', 'That export profile is archived. Restore it to take an export.', { status: 409 })
  const [file, closed, digest] = await Promise.all([buildFile(profile, input.from, input.to), rangeClosed(input.from, input.to), currentDigest(profile)])
  const sha256 = await fingerprint(file.csv)
  const same = await first<RunRow>('SELECT * FROM invoicing_export_runs WHERE profile_id = ? AND from_on = ? AND to_on = ? AND sha256 = ? ORDER BY created_at DESC, id DESC LIMIT 1', profile.id, input.from, input.to, sha256)
  const run: Run = { id: newId('ivr'), profileId: profile.id, from: input.from, to: input.to, rows: file.rows, unmappedRows: file.unmappedRows, closed, mapVersion: digest, sha256, by: input.by, createdAt: nowMs() }
  unit.add({
    sql: 'INSERT INTO invoicing_export_runs (id, profile_id, from_on, to_on, rows, unmapped_rows, closed, map_version, sha256, by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [run.id, run.profileId, run.from, run.to, run.rows, run.unmappedRows, run.closed ? 1 : 0, run.mapVersion, run.sha256, run.by, run.createdAt],
  })
  unit.audit({ action: 'export', record: ['invoicing.export-profile', profile.id], detail: { runId: run.id, from: run.from, to: run.to, rows: run.rows, closed } })
  unit.announce('invoicing.export.taken', { runId: run.id, profileId: profile.id }, { record: ['invoicing.export-profile', profile.id] })
  return { csv: file.csv, run, sameAs: same ? runOf(same) : null }
}

/** Whether taking a past run's range again now would give the same bytes. */
export async function checkRun(runId: string): Promise<{ same: boolean, mapChanged: boolean }> {
  const run = await getRun(runId)
  const profile = await getProfile(run.profileId)
  const [file, digest] = await Promise.all([buildFile(profile, run.from, run.to), currentDigest(profile)])
  return { same: await fingerprint(file.csv) === run.sha256, mapChanged: digest !== run.mapVersion }
}
