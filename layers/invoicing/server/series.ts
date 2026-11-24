// Invoice series (IE-07): a name, a prefix and padding, one default per kind. A number is taken only
// at issue, by a conditional raise of next_number (rule I-12), so none is skipped or used twice.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { formatNumber } from '../shared/invoices'

export interface Series { id: string, name: string, kind: 'invoice' | 'credit_note', prefix: string, pad: number, nextNumber: number, isDefault: boolean, archivedAt: number | null, next: string }

const COLUMNS = 'id, name, kind, prefix, pad, next_number AS nextNumber, is_default AS isDefault, archived_at AS archivedAt'
const shape = (r: Omit<Series, 'next'> & { isDefault: number | boolean }): Series => ({ ...r, isDefault: !!r.isDefault, next: formatNumber(r.prefix, r.pad, r.nextNumber) })

export const seriesFields = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: the column's bound
  prefix: z.string().max(12).regex(/^[A-Za-z0-9/-]*$/), // not-policy: the column's bound
  pad: z.number().int().min(1).max(8), // not-policy: the column's bound
}).strict()

export async function listSeries(): Promise<Series[]> {
  return (await all<Omit<Series, 'next'> & { isDefault: number }>(`SELECT ${COLUMNS} FROM invoicing_series ORDER BY archived_at IS NOT NULL, kind, name`)).map(shape)
}

export async function getSeries(id: string | undefined): Promise<Series | null> {
  const row = id ? await first<Omit<Series, 'next'> & { isDefault: number }>(`SELECT ${COLUMNS} FROM invoicing_series WHERE id = ?`, id) : null
  return row ? shape(row) : null
}

export async function defaultSeries(kind: Series['kind']): Promise<Series | null> {
  const row = await first<Omit<Series, 'next'> & { isDefault: number }>(`SELECT ${COLUMNS} FROM invoicing_series WHERE kind = ? AND is_default = 1 AND archived_at IS NULL`, kind)
  return row ? shape(row) : null
}

export function createSeries(unit: UnitView, input: z.infer<typeof seriesFields> & { kind: Series['kind'], isDefault?: boolean }): string {
  const id = newId('ivs')
  unit.add({
    sql: 'INSERT INTO invoicing_series (id, name, kind, prefix, pad, next_number, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
    params: [id, input.name, input.kind, input.prefix, input.pad, input.isDefault ? 1 : 0, nowMs(), nowMs()],
  })
  unit.audit({ action: 'create', record: ['invoicing.series', id], detail: { kind: input.kind, pad: input.pad } })
  return id
}

export async function updateSeries(unit: UnitView, series: Series, input: z.infer<typeof seriesFields>): Promise<void> {
  unit.add({ sql: 'UPDATE invoicing_series SET name = ?, prefix = ?, pad = ?, updated_at = ? WHERE id = ?', params: [input.name, input.prefix, input.pad, nowMs(), series.id] }).expect(1)
  unit.audit({ action: 'update', record: ['invoicing.series', series.id], detail: { prefixChanged: series.prefix !== input.prefix, pad: input.pad } })
}

/** Makes a series the default for its kind; the old default stops being one in the same batch. */
export function makeDefault(unit: UnitView, series: Series): void {
  if (series.archivedAt) refuse('invoicing.series.archived', 'An archived series cannot be the default.', { status: 409 })
  unit.add({ sql: 'UPDATE invoicing_series SET is_default = 0, updated_at = ? WHERE kind = ? AND is_default = 1 AND id <> ?', params: [nowMs(), series.kind, series.id] })
  unit.add({ sql: 'UPDATE invoicing_series SET is_default = 1, updated_at = ? WHERE id = ? AND archived_at IS NULL', params: [nowMs(), series.id] }).expect(1)
  unit.audit({ action: 'update', record: ['invoicing.series', series.id], detail: { isDefault: true } })
}

export function archiveSeries(unit: UnitView, series: Series, archive: boolean): void {
  if (archive && series.isDefault) refuse('invoicing.series.default', 'Make another series the default before archiving this one.', { status: 409 })
  unit.add({ sql: 'UPDATE invoicing_series SET archived_at = ?, updated_at = ? WHERE id = ? AND is_default = 0', params: [archive ? nowMs() : null, nowMs(), series.id] }).expect(1)
  unit.audit({ action: 'update', record: ['invoicing.series', series.id], detail: { archived: archive } })
}

/** The first series, INV- and CN- padded to 4, made when the module is switched on. Safe to repeat. */
export async function ensureDefaultSeries(unit: UnitView): Promise<void> {
  if (!(await defaultSeries('invoice'))) createSeries(unit, { kind: 'invoice', name: 'Invoices', prefix: 'INV-', pad: 4, isDefault: true }) // not-policy: the starting padding
  if (!(await defaultSeries('credit_note'))) createSeries(unit, { kind: 'credit_note', name: 'Credit notes', prefix: 'CN-', pad: 4, isDefault: true }) // not-policy: the starting padding
}

/** Takes a series' next number in the unit: one wins if two issue at once, the other's batch fails (I-12). */
export async function takeNumber(unit: UnitView, seriesId: string): Promise<string> {
  const series = await getSeries(seriesId)
  if (!series || series.archivedAt) refuse('invoicing.series.archived', 'This invoice\'s series is archived.', { status: 409, remedy: 'Choose another series.' })
  unit.add({
    sql: 'UPDATE invoicing_series SET next_number = next_number + 1, updated_at = ? WHERE id = ? AND next_number = ? AND archived_at IS NULL',
    params: [nowMs(), series!.id, series!.nextNumber],
  }).expect(1, { code: 'invoicing.series.taken', reason: 'Another invoice took that number a moment ago.', remedy: 'Issue it again.' })
  return series!.next
}
