// Run presets (run presets concept, Matt 2026-11-17): named patterns of start times, each with the
// days of the week it runs on, that the Add a run window starts from. Anyone who can add runs may
// save one from the window; the programme's managers change and delete them under Admin > Modules >
// Core. A preset holds no space, dates or running time: those change from run to run. A space may
// name its usual preset, and the theatre names one for spaces without.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, useSetting } from '#kit'
import type { UnitView } from '#kit'
import type { RunSlot } from './runs'

export interface RunPreset { id: string, name: string, slots: RunSlot[], spaces: number }

interface PresetRow { id: string, name: string, slots: string, spaces: number }

const record = (id: string): ['core.run-preset', string] => ['core.run-preset', id]
const NAME_TAKEN = { code: 'core.run-preset.name-taken', reason: 'A run preset already has that name.', fields: { name: 'Choose a different name.' } }

/** Each slot's days in week order and times in time order, repeats and empty slots dropped. */
export function tidySlots(slots: RunSlot[]): RunSlot[] {
  return slots
    .map(s => ({ days: [...new Set(s.days)].sort((a, b) => a - b), times: [...new Set(s.times)].sort() }))
    .filter(s => s.days.length && s.times.length)
}

const toPreset = (r: PresetRow): RunPreset => ({ id: r.id, name: r.name, slots: JSON.parse(r.slots) as RunSlot[], spaces: r.spaces })

/** Every preset by name, with how many spaces use it as their usual one. */
export async function listRunPresets(): Promise<RunPreset[]> {
  return (await all<PresetRow>(`SELECT r.id, r.name, r.slots, (SELECT count(*) FROM core_spaces s WHERE s.run_preset_id = r.id) AS spaces
    FROM core_run_presets r ORDER BY lower(r.name), r.id`)).map(toPreset)
}

/** The theatre's usual preset (core.programme.run-preset), if it still exists. */
export async function theatreRunPreset(): Promise<string | null> {
  const id = await useSetting('core.programme.run-preset') as string | null
  return id && await first('SELECT 1 FROM core_run_presets WHERE id = ?', id) ? id : null
}

async function refuseTakenName(name: string, except: string | null) {
  if (await first('SELECT 1 FROM core_run_presets WHERE lower(name) = lower(?) AND id IS NOT ?', name, except)) refuse(NAME_TAKEN.code, NAME_TAKEN.reason, { status: 409, fields: NAME_TAKEN.fields })
}

function checkSlots(slots: RunSlot[]): RunSlot[] {
  const tidy = tidySlots(slots)
  if (!tidy.length) refuse('core.run-preset.empty', 'A preset needs at least one start time with its days.', { status: 422, fields: { slots: 'Give a start time and tick its days.' } })
  return tidy
}

export async function createRunPreset(unit: UnitView, input: { name: string, slots: RunSlot[] }, actorId: string | null): Promise<string> {
  const slots = checkSlots(input.slots)
  await refuseTakenName(input.name, null)
  const id = newId('rps')
  const at = nowMs()
  unit.add(sql`INSERT INTO core_run_presets (id, name, slots, created_by, created_at, updated_at)
    SELECT ${id}, ${input.name}, ${JSON.stringify(slots)}, ${actorId}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM core_run_presets WHERE lower(name) = lower(${input.name}))`).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: record(id) })
  return id
}

export async function updateRunPreset(unit: UnitView, id: string, input: { name: string, slots: RunSlot[] }): Promise<void> {
  const slots = checkSlots(input.slots)
  await refuseTakenName(input.name, id)
  unit.add(sql`UPDATE core_run_presets SET name = ${input.name}, slots = ${JSON.stringify(slots)}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM core_run_presets WHERE lower(name) = lower(${input.name}) AND id <> ${id})`)
    .expect(1, { code: 'core.run-preset.not-found', reason: 'There is no such run preset, or another has that name.' })
  unit.audit({ action: 'update', record: record(id) })
}

/** Deletes a preset. A space that used it as its usual one falls back to the theatre's. */
export async function deleteRunPreset(unit: UnitView, id: string): Promise<void> {
  unit.add(sql`UPDATE core_spaces SET run_preset_id = NULL WHERE run_preset_id = ${id}`)
  unit.add(sql`DELETE FROM core_run_presets WHERE id = ${id}`).expect(1, { code: 'core.run-preset.not-found', reason: 'There is no such run preset.' })
  unit.audit({ action: 'delete', record: record(id) })
}
