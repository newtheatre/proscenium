// Ticket presets (show walkthrough, Matt 2026-11-17, decisions 2 and 8): the tickets a new show
// starts from, as run presets are the start times a new run starts from. The theatre names its usual
// preset (box-office.ticket-preset) and a space may name its own, used in place of the theatre's for
// shows there. Changing a preset never changes a show already set up: a show copies it.
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, changeSetting, first, idSchema, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'

export interface PresetPrice { ticketTypeId: string, amountMinor: number }
/** One part of the house. A show priced the same throughout has one, with no name and no seat count. */
export interface PresetSection { name: string | null, seats: number | null, prices: PresetPrice[] }
export interface TicketPreset { id: string, name: string, sections: PresetSection[], spaceIds: string[] }

const NAME_TAKEN = { code: 'box-office.ticket-preset.name-taken', reason: 'A ticket preset already has that name.', fields: { name: 'Choose a different name.' } }
const record = (id: string): ['box-office.ticket-preset', string] => ['box-office.ticket-preset', id]

export async function listTicketPresets(): Promise<TicketPreset[]> {
  const rows = await all<{ id: string, name: string, sections: string }>('SELECT id, name, sections FROM box_office_ticket_presets ORDER BY lower(name), id')
  const spaces = await all<{ preset_id: string, space_id: string }>('SELECT preset_id, space_id FROM box_office_space_ticket_presets')
  return rows.map(r => ({ id: r.id, name: r.name, sections: JSON.parse(r.sections) as PresetSection[], spaceIds: spaces.filter(s => s.preset_id === r.id).map(s => s.space_id) }))
}

/** The theatre's usual preset, if it still exists. */
export async function theatrePreset(): Promise<string | null> {
  const id = await useSetting('box-office.presets.usual') as string | null
  return id && await first('SELECT 1 FROM box_office_ticket_presets WHERE id = ?', id) ? id : null
}

/** The preset a new show in this space starts from: the space's own, else the theatre's, else none. */
export async function presetFor(spaceId: string | null): Promise<TicketPreset | null> {
  const presets = await listTicketPresets()
  const own = spaceId ? presets.find(p => p.spaceIds.includes(spaceId)) : undefined
  if (own) return own
  const usual = await theatrePreset()
  return presets.find(p => p.id === usual) ?? null
}

/** Sections tidied: names trimmed, a price given once per type, and a lone unnamed section kept as it is. */
async function checked(sections: PresetSection[]): Promise<PresetSection[]> {
  if (!sections.length) refuse('box-office.ticket-preset.empty', 'A preset needs at least one set of prices.', { status: 422 })
  if (sections.length > 1 && sections.some(s => !s.name?.trim()))
    refuse('box-office.ticket-preset.section-name', 'Each part of the house needs a name, such as Stalls or Balcony.', { status: 422, fields: { sections: 'Name every section.' } })
  const names = sections.map(s => s.name?.trim().toLowerCase() ?? '')
  if (new Set(names).size !== names.length) refuse('box-office.ticket-preset.section-repeated', 'Two sections have the same name.', { status: 422, fields: { sections: 'Give each section its own name.' } })
  const known = new Set((await all<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE kind <> 'complimentary'")).map(t => t.id))
  return sections.map((s) => {
    const seen = new Set<string>()
    const prices = s.prices.filter((p) => {
      if (!known.has(p.ticketTypeId)) refuse('box-office.ticket-type.not-found', 'One of these ticket types does not exist, or is not sold.', { status: 422 })
      if (seen.has(p.ticketTypeId)) return false
      seen.add(p.ticketTypeId)
      return true
    })
    return { name: sections.length > 1 ? s.name!.trim() : (s.name?.trim() || null), seats: s.seats ?? null, prices }
  })
}

async function refuseTakenName(name: string, except: string | null) {
  if (await first('SELECT 1 FROM box_office_ticket_presets WHERE lower(name) = lower(?) AND id IS NOT ?', name, except)) refuse(NAME_TAKEN.code, NAME_TAKEN.reason, { status: 409, fields: NAME_TAKEN.fields })
}

/** Makes this preset the usual one of these spaces, and of no others. A space's earlier usual one gives way. */
function setSpaces(unit: UnitView, id: string, spaceIds: string[]) {
  const at = nowMs()
  unit.add(sql`DELETE FROM box_office_space_ticket_presets WHERE preset_id = ${id}`)
  for (const spaceId of new Set(spaceIds)) {
    unit.add(sql`INSERT INTO box_office_space_ticket_presets (id, space_id, preset_id, created_at) VALUES (${newId('stp')}, ${spaceId}, ${id}, ${at})
      ON CONFLICT (space_id) DO UPDATE SET preset_id = excluded.preset_id, created_at = excluded.created_at`)
  }
}

/** What a ticket preset is sent as: a name, its sections with their prices, and the spaces it is usual in. */
export const presetInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's own bound on a name
  sections: z.array(z.object({
    name: z.string().trim().max(60).nullable(), // not-policy: a short name such as "Stalls"
    seats: z.number().int().min(0).max(100000).nullable(), // not-policy: a sanity bound, larger than any house
    prices: z.array(z.object({ ticketTypeId: idSchema('tty'), amountMinor: z.number().int().min(0).max(10_000_000) }).strict()).max(50), // not-policy: a sanity bound on a ticket price and on a list of types
  }).strict()).min(1).max(20), // not-policy: more parts of the house than any theatre prices
  spaceIds: z.array(z.string().min(3).max(40)).max(100).optional(), // not-policy: a sanity bound on spaces
}).strict()

export type PresetInput = z.infer<typeof presetInput>

export async function createTicketPreset(unit: UnitView, input: PresetInput, actorId: string | null): Promise<string> {
  const sections = await checked(input.sections)
  await refuseTakenName(input.name, null)
  const id = newId('tps')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_ticket_presets (id, name, sections, created_by, created_at, updated_at)
    SELECT ${id}, ${input.name}, ${JSON.stringify(sections)}, ${actorId}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_ticket_presets WHERE lower(name) = lower(${input.name}))`).expect(1, NAME_TAKEN)
  if (input.spaceIds) setSpaces(unit, id, input.spaceIds)
  unit.audit({ action: 'create', record: record(id) })
  return id
}

export async function updateTicketPreset(unit: UnitView, id: string, input: PresetInput): Promise<void> {
  const sections = await checked(input.sections)
  await refuseTakenName(input.name, id)
  unit.add(sql`UPDATE box_office_ticket_presets SET name = ${input.name}, sections = ${JSON.stringify(sections)}, updated_at = ${nowMs()}
    WHERE id = ${id} AND NOT EXISTS (SELECT 1 FROM box_office_ticket_presets WHERE lower(name) = lower(${input.name}) AND id <> ${id})`)
    .expect(1, { code: 'box-office.ticket-preset.not-found', reason: 'There is no such ticket preset, or another has that name.' })
  if (input.spaceIds) setSpaces(unit, id, input.spaceIds)
  unit.audit({ action: 'update', record: record(id) })
}

/** Deletes a preset. Shows that started from it keep their tickets; its spaces fall back to the theatre's usual one. */
export function deleteTicketPreset(unit: UnitView, id: string): void {
  unit.add(sql`DELETE FROM box_office_space_ticket_presets WHERE preset_id = ${id}`)
  unit.add(sql`DELETE FROM box_office_ticket_presets WHERE id = ${id}`).expect(1, { code: 'box-office.ticket-preset.not-found', reason: 'There is no such ticket preset.' })
  unit.audit({ action: 'delete', record: record(id) })
}

/**
 * A new site's tickets (decision 8): Full price and Concession, and a "Usual tickets" preset with
 * them unpriced, made the theatre's usual, so the first thing asked is two prices. Only when the
 * theatre has no ticket types and no presets of its own, so switching Box office off and on again
 * adds nothing.
 */
export async function seedTickets(unit: UnitView): Promise<void> {
  if (await first('SELECT 1 FROM box_office_ticket_types WHERE managed_by IS NULL')) return
  if (await first('SELECT 1 FROM box_office_ticket_presets')) return
  const at = nowMs()
  const presetId = newId('tps')
  unit.add(sql`INSERT INTO box_office_ticket_types (id, name, kind, active, channel, sort, created_at, updated_at)
    VALUES (${newId('tty')}, 'Full price', 'standard', 1, 'all', 0, ${at}, ${at}) ON CONFLICT DO NOTHING`)
  unit.add(sql`INSERT INTO box_office_ticket_types (id, name, kind, proof_note, active, channel, sort, created_at, updated_at)
    VALUES (${newId('tty')}, 'Concession', 'concession', 'Students, under 18s and over 65s: bring proof.', 1, 'all', 1, ${at}, ${at}) ON CONFLICT DO NOTHING`)
  unit.add(sql`INSERT INTO box_office_ticket_presets (id, name, sections, created_at, updated_at)
    VALUES (${presetId}, 'Usual tickets', ${JSON.stringify([{ name: null, seats: null, prices: [] }])}, ${at}, ${at}) ON CONFLICT DO NOTHING`)
  await changeSetting(unit, 'box-office.presets.usual', presetId, { reason: 'A new site\'s usual tickets.' })
  unit.audit({ action: 'create', record: record(presetId), detail: { seeded: true } })
}
