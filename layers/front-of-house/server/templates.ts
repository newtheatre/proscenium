// Rota templates (part 3, "Shifts"; FH-05, FH-06). A template is a named set of duties and place
// counts. Applying it to performances makes draft shifts with the duties' default times; applying it
// twice adds only duties not already present. A performance in a space the theatre does not manage
// is skipped by the bulk action (R-36): shifts are added to it by hand.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { getPerformance } from '#modules/core'
import { rotaTemplateLines, shifts } from './db/schema'
import { listDuties, shiftTimes } from './shifts'

const MINUTE = 60_000 // not-policy: unit conversion

export interface TemplateLine { dutyId: string, places: number }
export interface RotaTemplate { id: string, name: string, venueId: string | null, isDefault: boolean, archivedAt: number | null, lines: TemplateLine[] }

export async function listTemplates(options: { includeArchived?: boolean } = {}): Promise<RotaTemplate[]> {
  const rows = await all<{ id: string, name: string, venue_id: string | null, is_default: number, archived_at: number | null }>(
    `SELECT * FROM front_of_house_rota_templates ${options.includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY name`)
  const lines = await all<{ template_id: string, duty_id: string, places: number }>(
    'SELECT l.template_id, l.duty_id, l.places FROM front_of_house_rota_template_lines l JOIN front_of_house_duties d ON d.id = l.duty_id ORDER BY d.sort_order, d.name')
  return rows.map(r => ({
    id: r.id, name: r.name, venueId: r.venue_id, isDefault: !!r.is_default, archivedAt: r.archived_at,
    lines: lines.filter(l => l.template_id === r.id).map(l => ({ dutyId: l.duty_id, places: l.places })),
  }))
}

export async function getTemplate(id: string): Promise<RotaTemplate | null> {
  return (await listTemplates({ includeArchived: true })).find(t => t.id === id) ?? null
}

export interface TemplateInput { name: string, venueId?: string | null, isDefault?: boolean, lines: TemplateLine[] }

/** Clears the default of the template's venue (or of no venue), so the new one can take it. */
function clearDefault(unit: UnitView, venueId: string | null, at: number): void {
  unit.add({ sql: 'UPDATE front_of_house_rota_templates SET is_default = 0, updated_at = ? WHERE is_default = 1 AND coalesce(venue_id, \'\') = coalesce(?, \'\')', params: [at, venueId] })
}

function writeLines(unit: UnitView, templateId: string, lines: TemplateLine[]): void {
  unit.add({ sql: 'DELETE FROM front_of_house_rota_template_lines WHERE template_id = ?', params: [templateId] })
  if (!lines.length) return
  unit.insertSet(rotaTemplateLines, lines.map(l => ({ templateId, dutyId: l.dutyId, places: l.places })))
  // Every duty named is live: an archived duty takes no new shifts, so it joins no template.
  unit.add({
    sql: 'UPDATE front_of_house_rota_templates SET updated_at = updated_at WHERE id = ? AND NOT EXISTS (SELECT 1 FROM front_of_house_rota_template_lines l JOIN front_of_house_duties d ON d.id = l.duty_id WHERE l.template_id = ? AND d.archived_at IS NOT NULL)',
    params: [templateId, templateId],
  }).expect(1, { code: 'front-of-house.duty-archived', reason: 'One of these duties is archived.', remedy: 'Take it out of the template.' })
}

function uniqueDuties(lines: TemplateLine[]): void {
  if (new Set(lines.map(l => l.dutyId)).size !== lines.length)
    refuse('front-of-house.template-duty-twice', 'A duty appears twice in the template.', { status: 422, remedy: 'Give the duty one line with all its places.' })
}

export function createTemplate(unit: UnitView, input: TemplateInput): string {
  uniqueDuties(input.lines)
  const id = newId('rtp')
  const at = nowMs()
  if (input.isDefault) clearDefault(unit, input.venueId ?? null, at)
  unit.add({
    sql: `INSERT INTO front_of_house_rota_templates (id, name, venue_id, is_default, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM front_of_house_rota_templates WHERE name = ? AND archived_at IS NULL)`,
    params: [id, input.name, input.venueId ?? null, input.isDefault ? 1 : 0, at, at, input.name],
  }).expect(1, { code: 'front-of-house.template-name-taken', reason: 'There is already a rota template with that name.' })
  writeLines(unit, id, input.lines)
  unit.audit({ action: 'create', detail: { template: id, lines: input.lines.length } })
  return id
}

export async function updateTemplate(unit: UnitView, id: string, input: TemplateInput): Promise<void> {
  uniqueDuties(input.lines)
  if (!await first('SELECT 1 AS one FROM front_of_house_rota_templates WHERE id = ? AND archived_at IS NULL', id))
    refuse('core.not-found', 'There is no such rota template, or it is archived.', { status: 404 })
  const at = nowMs()
  if (input.isDefault) clearDefault(unit, input.venueId ?? null, at)
  unit.add({
    sql: `UPDATE front_of_house_rota_templates SET name = ?, venue_id = ?, is_default = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM front_of_house_rota_templates WHERE name = ? AND archived_at IS NULL AND id <> ?)`,
    params: [input.name, input.venueId ?? null, input.isDefault ? 1 : 0, at, id, input.name, id],
  }).expect(1, { code: 'front-of-house.template-name-taken', reason: 'There is already a rota template with that name.' })
  writeLines(unit, id, input.lines)
  unit.audit({ action: 'update', detail: { template: id, lines: input.lines.length } })
}

export function archiveTemplate(unit: UnitView, id: string): void {
  unit.add({ sql: 'UPDATE front_of_house_rota_templates SET archived_at = ?, is_default = 0, updated_at = ? WHERE id = ? AND archived_at IS NULL', params: [nowMs(), nowMs(), id] })
    .expect(1, { code: 'front-of-house.template-archived', reason: 'This rota template is already archived.' })
  unit.audit({ action: 'update', detail: { template: id, archived: true } })
}

/** Brings an archived template back. It does not become the default again; that is a choice to make afresh. */
export async function restoreTemplate(unit: UnitView, id: string): Promise<void> {
  const row = await first<{ archived_at: number | null }>('SELECT archived_at FROM front_of_house_rota_templates WHERE id = ?', id)
  if (!row) refuse('core.not-found', 'There is no such rota template.', { status: 404 })
  const refusal = row.archived_at === null
    ? { code: 'front-of-house.template-not-archived', reason: 'This rota template is not archived.' }
    : { code: 'front-of-house.template-name-taken', reason: 'There is already a rota template with that name.', remedy: 'Rename the other template, then restore this one.' }
  unit.add({
    sql: `UPDATE front_of_house_rota_templates SET archived_at = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM front_of_house_rota_templates o WHERE o.name = front_of_house_rota_templates.name AND o.archived_at IS NULL)`,
    params: [nowMs(), id],
  }).expect(1, refusal)
  unit.audit({ action: 'update', detail: { template: id, restored: true } })
}

export interface ApplyResult {
  /** Shifts made, by performance. */
  added: { performanceId: string, shiftIds: string[] }[]
  skipped: { performanceId: string, reason: 'not-managed' | 'over' | 'nothing-new' }[]
}

/**
 * Applies a template to performances, as draft shifts with each duty's default times. Duties a
 * performance already has are left alone. `bulk` skips performances in spaces the theatre does not
 * manage; applying to one performance from its own rota does not.
 */
export async function applyTemplate(unit: UnitView, templateId: string, performanceIds: string[], options: { bulk: boolean }): Promise<ApplyResult> {
  const template = await getTemplate(templateId)
  if (!template || template.archivedAt !== null) refuse('core.not-found', 'There is no such rota template, or it is archived.', { status: 404 })
  const duties = new Map((await listDuties()).map(d => [d.id, d]))
  const lines = template.lines.filter(l => duties.has(l.dutyId))
  const existing = await all<{ performance_id: string, duty_id: string }>(
    'SELECT performance_id, duty_id FROM front_of_house_shifts WHERE performance_id IN (SELECT value FROM json_each(?))', JSON.stringify(performanceIds))
  const result: ApplyResult = { added: [], skipped: [] }
  const rows: Record<string, unknown>[] = []
  const at = nowMs()
  for (const performanceId of [...new Set(performanceIds)]) {
    const performance = await getPerformance(performanceId)
    if (performance.state === 'cancelled' || performance.state === 'completed') {
      result.skipped.push({ performanceId, reason: 'over' })
      continue
    }
    if (options.bulk && !performance.spaceManaged) {
      result.skipped.push({ performanceId, reason: 'not-managed' })
      continue
    }
    const has = new Set(existing.filter(e => e.performance_id === performanceId).map(e => e.duty_id))
    const fresh = lines.filter(l => !has.has(l.dutyId))
    if (!fresh.length) {
      result.skipped.push({ performanceId, reason: 'nothing-new' })
      continue
    }
    const start = rows.length
    for (const line of fresh) {
      const duty = duties.get(line.dutyId)!
      const times = await shiftTimes({ callAt: performance.startsAt - duty.callBeforeMinutes * MINUTE, endsAt: performance.endsAt + duty.stayAfterMinutes * MINUTE, signUp: true })
      rows.push({ performanceId, venueId: performance.venueId, dutyId: duty.id, places: line.places, ...times, state: 'draft', createdAt: at, updatedAt: at })
    }
    result.added.push({ performanceId, shiftIds: Array.from({ length: rows.length - start }, () => '') })
  }
  if (!rows.length) return result
  // A second apply racing this one meets the unique rule on performance and duty, and its unit fails whole.
  const ids = unit.insertSet(shifts, rows)
  unit.expect(rows.length)
  let next = 0
  for (const added of result.added) added.shiftIds = added.shiftIds.map(() => ids[next++]!)
  unit.audit(ids.map(id => ({ action: 'create', record: ['front-of-house.shift', id] as const, detail: { template: templateId } })))
  return result
}
