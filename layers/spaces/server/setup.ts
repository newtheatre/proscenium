// Setting up room bookings (SP-05 to SP-12): which spaces can be booked, resources, opening hours,
// purposes and their tiers, and which purposes each bookable allows. Every write is one statement
// whose predicate carries its own condition, so two administrators at once cannot leave it half done.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { placeOf } from '#modules/core'
import { clockMinutes, startingPurposes, type StartingList } from '../shared/setup'
import type { BookableDetails, HoursInput, NewBookable, PurposeInput } from './inputs'

const NOT_FOUND = { code: 'spaces.not-bookable', reason: 'There is no such room or resource to book.' }
const CHANGED = { code: 'spaces.bookable.changed', reason: 'This room changed just now, so nothing was saved.', remedy: 'Reload it and try again.' }

// ---- Reading -------------------------------------------------------------------------------------

export interface BookableRow {
  id: string
  kind: 'space' | 'resource'
  spaceId: string | null
  name: string
  venueId: string | null
  venueName: string | null
  control: 'own' | 'external'
  approval: 'by-purpose' | 'always'
  approvalNote: string | null
  externalContact: string | null
  alwaysOpen: boolean
  maxLengthMinutes: number | null
  guidance: string | null
  colour: string | null
  requirements: string[]
  state: 'active' | 'paused' | 'archived'
  capacity: number | null
}

const BOOKABLE_SELECT = `SELECT b.*, s.name AS space_name, s.default_capacity, s.venue_id AS space_venue_id, v.name AS venue_name
  FROM spaces_bookables b
  LEFT JOIN core_spaces s ON s.id = b.space_id
  LEFT JOIN core_venues v ON v.id = coalesce(s.venue_id, b.home_venue_id)`

const toRow = (r: any): BookableRow => ({
  id: r.id,
  kind: r.kind,
  spaceId: r.space_id,
  name: r.kind === 'space' ? placeOf(r.space_name, r.venue_name) : r.name,
  venueId: r.space_venue_id ?? r.home_venue_id,
  venueName: r.venue_name,
  control: r.control,
  approval: r.approval,
  approvalNote: r.approval_note,
  externalContact: r.external_contact,
  alwaysOpen: !!r.always_open,
  maxLengthMinutes: r.max_length_minutes,
  guidance: r.guidance,
  colour: r.colour,
  requirements: JSON.parse(r.requirements ?? '[]'),
  state: r.state,
  capacity: r.default_capacity ?? null,
})

/** Every bookable, archived last, in the order the theatre set. */
export async function listBookables(): Promise<BookableRow[]> {
  const rows = await all(`${BOOKABLE_SELECT} ORDER BY b.state = 'archived', b.sort, lower(coalesce(v.name, '')), lower(coalesce(s.name, b.name))`)
  return rows.map(toRow)
}

export async function bookableRow(id: string): Promise<BookableRow> {
  const row = await first(`${BOOKABLE_SELECT} WHERE b.id = ?`, id)
  return row ? toRow(row) : refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 })
}

/** Core's active spaces by venue, each with its bookable if it has one (the Rooms and resources list). */
export async function spacesByVenue(): Promise<{ id: string, name: string, spaces: { id: string, name: string, managed: boolean, capacity: number | null, bookableId: string | null, state: string | null }[] }[]> {
  const rows = await all<{ venue_id: string, venue_name: string, id: string, name: string, managed: number, default_capacity: number | null, bookable_id: string | null, state: string | null }>(
    `SELECT v.id AS venue_id, v.name AS venue_name, s.id, s.name, s.managed, s.default_capacity, b.id AS bookable_id, b.state
       FROM core_spaces s JOIN core_venues v ON v.id = s.venue_id
       LEFT JOIN spaces_bookables b ON b.space_id = s.id
      WHERE s.state = 'active' AND v.state = 'active'
      ORDER BY lower(v.name), s.sort, lower(s.name)`)
  const venues = new Map<string, { id: string, name: string, spaces: { id: string, name: string, managed: boolean, capacity: number | null, bookableId: string | null, state: string | null }[] }>()
  for (const r of rows) {
    const venue = venues.get(r.venue_id) ?? { id: r.venue_id, name: r.venue_name, spaces: [] }
    venue.spaces.push({ id: r.id, name: r.name, managed: !!r.managed, capacity: r.default_capacity, bookableId: r.bookable_id, state: r.state })
    venues.set(r.venue_id, venue)
  }
  return [...venues.values()]
}

export interface HoursRow { weekday: number, opensAt: string, closesAt: string }

export async function hoursOf(bookableId: string): Promise<HoursRow[]> {
  return (await all<{ weekday: number, opens_at: string, closes_at: string }>('SELECT weekday, opens_at, closes_at FROM spaces_opening_hours WHERE bookable_id = ? ORDER BY weekday, opens_at', bookableId))
    .map(r => ({ weekday: r.weekday, opensAt: r.opens_at, closesAt: r.closes_at }))
}

/** Every purpose that is not retired, with what this bookable says of it. No row means allowed, following the purpose. */
export async function purposesOf(bookableId: string): Promise<{ purposeId: string, name: string, tier: number, approval: 'automatic' | 'approval', allowed: boolean, here: 'automatic' | 'approval' | null }[]> {
  const rows = await all<{ id: string, name: string, tier: number, approval: 'automatic' | 'approval', allowed: number | null, here: 'automatic' | 'approval' | null }>(
    `SELECT p.id, p.name, p.tier, p.approval, bp.allowed, bp.approval AS here
       FROM spaces_purposes p LEFT JOIN spaces_bookable_purposes bp ON bp.purpose_id = p.id AND bp.bookable_id = ?
      WHERE p.state = 'active' ORDER BY p.tier, p.sort, lower(p.name)`, bookableId)
  return rows.map(r => ({ purposeId: r.id, name: r.name, tier: r.tier, approval: r.approval, allowed: r.allowed === null ? true : !!r.allowed, here: r.here }))
}

// ---- Bookables -----------------------------------------------------------------------------------

/**
 * Makes a space bookable (SP-05), or adds a resource (SP-10). A space's control follows core's
 * managed flag (rule C6): a space the theatre does not run is an external room (SP-11).
 */
export function addBookable(unit: UnitView, input: NewBookable): string {
  const id = newId('bkb')
  const at = nowMs()
  if ('spaceId' in input) {
    unit.add({
      sql: `INSERT INTO spaces_bookables (id, kind, space_id, control, external_contact, approval_note, created_at, updated_at)
            SELECT ?, 'space', s.id, CASE WHEN s.managed = 1 THEN 'own' ELSE 'external' END, CASE WHEN s.managed = 1 THEN NULL ELSE ? END, ?, ?, ?
              FROM core_spaces s WHERE s.id = ? AND s.state = 'active' AND NOT EXISTS (SELECT 1 FROM spaces_bookables WHERE space_id = s.id)`,
      params: [id, input.externalContact ?? null, input.approvalNote ?? null, at, at, input.spaceId],
    }).expect(1, { code: 'spaces.space.unavailable', reason: 'That space is already bookable, or is no longer in use.', remedy: 'Reload the list.' })
  }
  else {
    unit.add({
      sql: `INSERT INTO spaces_bookables (id, kind, name, home_venue_id, control, external_contact, approval_note, created_at, updated_at)
            SELECT ?, 'resource', ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM spaces_bookables WHERE kind = 'resource' AND lower(name) = lower(?))
               AND (? IS NULL OR EXISTS (SELECT 1 FROM core_venues WHERE id = ? AND state = 'active'))`,
      params: [id, input.name, input.homeVenueId ?? null, input.control, input.control === 'external' ? input.externalContact ?? null : null, input.approvalNote ?? null, at, at, input.name, input.homeVenueId ?? null, input.homeVenueId ?? null],
    }).expect(1, { code: 'spaces.resource.name-taken', reason: 'There is already a resource with that name.', remedy: 'Choose another name, or edit the one that exists.' })
  }
  unit.announce('spaces.bookable.created', { bookableId: id }, { record: ['spaces.bookable', id] })
  unit.audit({ action: 'create', record: ['spaces.bookable', id], detail: { kind: 'spaceId' in input ? 'space' : 'resource' } })
  return id
}

/** The Details tab. A space's control is core's to say, so only a resource's may change here. */
export function updateBookable(unit: UnitView, bookable: BookableRow, input: BookableDetails): void {
  const resource = bookable.kind === 'resource'
  const control = resource ? input.control ?? bookable.control : bookable.control
  unit.add({
    sql: `UPDATE spaces_bookables SET name = ?, home_venue_id = ?, control = ?, approval = ?, approval_note = ?, external_contact = ?, guidance = ?, colour = ?,
            max_length_minutes = ?, requirements = ?, updated_at = ?
           WHERE id = ? AND state != 'archived'
             AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM spaces_bookables o WHERE o.kind = 'resource' AND o.id != spaces_bookables.id AND lower(o.name) = lower(?)))
             AND (? IS NULL OR EXISTS (SELECT 1 FROM core_venues WHERE id = ? AND state = 'active'))`,
    params: [
      resource ? input.name ?? bookable.name : null,
      resource ? input.homeVenueId ?? null : null,
      control,
      input.approval,
      input.approvalNote ?? null,
      control === 'external' ? input.externalContact ?? null : null,
      input.guidance ?? null,
      input.colour,
      input.maxLengthMinutes,
      JSON.stringify(input.requirements),
      nowMs(),
      bookable.id,
      resource ? input.name ?? null : null,
      resource ? input.name ?? null : null,
      resource ? input.homeVenueId ?? null : null,
      resource ? input.homeVenueId ?? null : null,
    ],
  }).expect(1, resource
    ? { code: 'spaces.resource.name-taken', reason: 'Another resource has that name, or this one is archived.', remedy: 'Choose another name.' }
    : { code: 'spaces.bookable.archived', reason: 'This room is archived.', remedy: 'Restore it first.' })
  unit.audit({ action: 'update', record: ['spaces.bookable', bookable.id], detail: { details: true } })
}

/** The rows of a week of opening hours, each a span inside one day. Spans of one day may not overlap. */
export function checkHours(hours: HoursInput['hours']): void {
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday || a.opensAt.localeCompare(b.opensAt))
  for (const [i, h] of sorted.entries()) {
    if (clockMinutes(h.closesAt) <= clockMinutes(h.opensAt) || clockMinutes(h.closesAt) > clockMinutes('24:00') || clockMinutes(h.opensAt) >= clockMinutes('24:00'))
      refuse('spaces.hours.backwards', 'Each opening must close after it opens, on the same day.', { status: 422, remedy: 'Hours past midnight go on the next day, from 00:00.' })
    const before = sorted[i - 1]
    if (before && before.weekday === h.weekday && h.opensAt < before.closesAt)
      refuse('spaces.hours.overlap', 'Two openings on the same day overlap.', { status: 422, remedy: 'Join them into one, or move one.' })
  }
}

/** Replaces a bookable's week of hours (SP-06). Changing them never moves a booking already made. */
export function setHours(unit: UnitView, bookable: BookableRow, input: HoursInput): void {
  checkHours(input.hours)
  const at = nowMs()
  unit.add({ sql: 'UPDATE spaces_bookables SET always_open = ?, updated_at = ? WHERE id = ? AND state != \'archived\'', params: [input.alwaysOpen ? 1 : 0, at, bookable.id] })
    .expect(1, CHANGED)
  unit.add({ sql: 'DELETE FROM spaces_opening_hours WHERE bookable_id = ?', params: [bookable.id] })
  if (input.hours.length) {
    unit.add({
      sql: `INSERT INTO spaces_opening_hours (bookable_id, weekday, opens_at, closes_at)
            SELECT ?, json_extract(value, '$.weekday'), json_extract(value, '$.opensAt'), json_extract(value, '$.closesAt') FROM json_each(?)`,
      params: [bookable.id, JSON.stringify(input.hours)],
    })
  }
  unit.audit({ action: 'update', record: ['spaces.bookable', bookable.id], detail: { hours: input.hours.length, alwaysOpen: input.alwaysOpen } })
}

/**
 * Which purposes a bookable allows and how each is approved here (SP-09). Only rows that differ from
 * the default are kept: allowed and following the purpose is no row at all.
 */
export function setBookablePurposes(unit: UnitView, bookable: BookableRow, rows: { purposeId: string, allowed: boolean, approval: 'automatic' | 'approval' | null }[]): void {
  const kept = rows.filter(r => !r.allowed || r.approval !== null).map(r => ({ purposeId: r.purposeId, allowed: r.allowed ? 1 : 0, approval: r.allowed ? r.approval : null }))
  unit.add({ sql: 'UPDATE spaces_bookables SET updated_at = ? WHERE id = ? AND state != \'archived\'', params: [nowMs(), bookable.id] }).expect(1, CHANGED)
  unit.add({ sql: 'DELETE FROM spaces_bookable_purposes WHERE bookable_id = ?', params: [bookable.id] })
  if (kept.length) {
    unit.add({
      sql: `INSERT INTO spaces_bookable_purposes (bookable_id, purpose_id, allowed, approval)
            SELECT ?, p.id, json_extract(j.value, '$.allowed'), json_extract(j.value, '$.approval')
              FROM json_each(?) j JOIN spaces_purposes p ON p.id = json_extract(j.value, '$.purposeId')`,
      params: [bookable.id, JSON.stringify(kept)],
    })
  }
  unit.audit({ action: 'update', record: ['spaces.bookable', bookable.id], detail: { purposes: kept.length } })
}

const STATE_EVENT = { paused: 'spaces.bookable.paused', archived: 'spaces.bookable.archived' } as const

/**
 * Pauses, resumes, archives or restores a bookable (SP-12, rules L4 and L5). A paused one takes no
 * new requests and keeps what it has. Archiving waits until nothing is booked ahead.
 */
export function setBookableState(unit: UnitView, bookable: BookableRow, to: 'active' | 'paused' | 'archived'): void {
  const at = nowMs()
  const from = to === 'paused' ? ['active'] : to === 'archived' ? ['active', 'paused'] : ['paused', 'archived']
  if (!from.includes(bookable.state)) refuse('spaces.bookable.wrong-state', 'This room cannot make that change from where it is now.', { status: 409, remedy: 'Reload it and try again.' })
  unit.add({
    sql: `UPDATE spaces_bookables SET state = ?, updated_at = ? WHERE id = ? AND state = ?
            AND (? != 'archived' OR NOT EXISTS (SELECT 1 FROM spaces_bookings WHERE bookable_id = spaces_bookables.id AND state IN ('requested', 'confirmed') AND ends_at > ?))
            AND (? != 'active' OR space_id IS NULL OR EXISTS (SELECT 1 FROM core_spaces WHERE id = spaces_bookables.space_id AND state = 'active'))`,
    params: [to, at, bookable.id, bookable.state, to, at, to],
  }).expect(1, to === 'archived'
    ? { code: 'spaces.bookable.has-bookings', reason: 'This room has bookings or requests still to come.', remedy: 'Pause it so it takes no new ones, and archive it once they are past.' }
    : to === 'active' && bookable.state === 'archived'
      ? { code: 'spaces.bookable.space-archived', reason: 'The space this room belongs to is archived.', remedy: 'Restore the space first.' }
      : CHANGED)
  if (to !== 'active') unit.announce(STATE_EVENT[to], { bookableId: bookable.id }, { record: ['spaces.bookable', bookable.id] })
  unit.audit({ action: 'state', record: ['spaces.bookable', bookable.id], detail: { from: bookable.state, to } })
}

// ---- Purposes ------------------------------------------------------------------------------------

export interface Purpose extends PurposeInput { id: string, slug: string, state: 'active' | 'retired', sort: number }

const toPurpose = (r: any): Purpose => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  tier: r.tier,
  openTo: r.open_to,
  needsProduction: !!r.needs_production,
  approval: r.approval,
  maxLengthMinutes: r.max_length_minutes,
  maxAheadDays: r.max_ahead_days,
  minNoticeMinutes: r.min_notice_minutes,
  mayRepeat: !!r.may_repeat,
  canBeBumped: !!r.can_be_bumped,
  requirements: JSON.parse(r.requirements ?? '[]'),
  state: r.state,
  sort: r.sort,
})

/** Every purpose in tier order, retired last. */
export async function listPurposes(): Promise<Purpose[]> {
  return (await all('SELECT * FROM spaces_purposes ORDER BY state = \'retired\', tier, sort, lower(name)')).map(toPurpose)
}

export async function purposeRow(id: string): Promise<Purpose> {
  const row = await first('SELECT * FROM spaces_purposes WHERE id = ?', id)
  return row ? toPurpose(row) : refuse('spaces.purpose.not-found', 'There is no such purpose.', { status: 404 })
}

const NAME_TAKEN = { code: 'spaces.purpose.name-taken', reason: 'There is already a purpose with that name.', remedy: 'Choose another name, or edit the one that exists.' }

const slugOf = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'purpose' // not-policy: a slug's length

/** A purpose for a production's team always names the production (the table's CHECK). */
const teamNeedsProduction = (input: PurposeInput) => input.openTo === 'production-team' ? true : input.needsProduction

export async function addPurpose(unit: UnitView, input: PurposeInput): Promise<string> {
  const id = newId('bpu')
  const at = nowMs()
  const base = slugOf(input.name)
  const slug = await first('SELECT 1 FROM spaces_purposes WHERE slug = ?', base) ? `${base}-${id.slice(-6)}` : base // not-policy: a short suffix
  unit.add({
    sql: `INSERT INTO spaces_purposes (id, slug, name, tier, open_to, needs_production, approval, max_length_minutes, max_ahead_days, min_notice_minutes,
            may_repeat, can_be_bumped, requirements, description, sort, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(sort), 0) + 1 FROM spaces_purposes WHERE tier = ?), ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM spaces_purposes WHERE lower(name) = lower(?))`,
    params: [id, slug, input.name, input.tier, input.openTo, teamNeedsProduction(input) ? 1 : 0, input.approval, input.maxLengthMinutes, input.maxAheadDays, input.minNoticeMinutes,
      input.mayRepeat ? 1 : 0, input.canBeBumped ? 1 : 0, JSON.stringify(input.requirements), input.description ?? null, input.tier, at, at, input.name],
  }).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: ['spaces.purpose', id], detail: { tier: input.tier } })
  return id
}

/** Changes a purpose (SP-08). Bookings already made keep the tier they were made with (rule L6). */
export function updatePurpose(unit: UnitView, purpose: Purpose, input: PurposeInput): void {
  const at = nowMs()
  unit.add({
    sql: `UPDATE spaces_purposes SET name = ?, tier = ?, open_to = ?, needs_production = ?, approval = ?, max_length_minutes = ?, max_ahead_days = ?, min_notice_minutes = ?,
            may_repeat = ?, can_be_bumped = ?, requirements = ?, description = ?, updated_at = ?,
            sort = CASE WHEN tier = ? THEN sort ELSE (SELECT coalesce(max(sort), 0) + 1 FROM spaces_purposes WHERE tier = ?) END
           WHERE id = ? AND NOT EXISTS (SELECT 1 FROM spaces_purposes o WHERE o.id != spaces_purposes.id AND lower(o.name) = lower(?))`,
    params: [input.name, input.tier, input.openTo, teamNeedsProduction(input) ? 1 : 0, input.approval, input.maxLengthMinutes, input.maxAheadDays, input.minNoticeMinutes,
      input.mayRepeat ? 1 : 0, input.canBeBumped ? 1 : 0, JSON.stringify(input.requirements), input.description ?? null, at, input.tier, input.tier, purpose.id, input.name],
  }).expect(1, NAME_TAKEN)
  unit.audit({ action: 'update', record: ['spaces.purpose', purpose.id], detail: purpose.tier === input.tier ? {} : { fromTier: purpose.tier, toTier: input.tier } })
}

/** A purpose in use is retired, never deleted: it is offered no more and its bookings keep it. */
export function setPurposeState(unit: UnitView, purpose: Purpose, to: 'active' | 'retired'): void {
  unit.add({ sql: 'UPDATE spaces_purposes SET state = ?, updated_at = ? WHERE id = ? AND state != ?', params: [to, nowMs(), purpose.id, to] })
    .expect(1, { code: 'spaces.purpose.changed', reason: to === 'retired' ? 'This purpose is already retired.' : 'This purpose is not retired.' })
  unit.audit({ action: 'state', record: ['spaces.purpose', purpose.id], detail: { to } })
}

/** The order of purposes inside a tier: each named purpose takes its place in the list given. */
export function orderPurposes(unit: UnitView, ids: string[]): void {
  unit.add({
    sql: `UPDATE spaces_purposes SET sort = (SELECT j.key + 1 FROM json_each(?) j WHERE j.value = spaces_purposes.id), updated_at = ?
           WHERE id IN (SELECT value FROM json_each(?))`,
    params: [JSON.stringify(ids), nowMs(), JSON.stringify(ids)],
  })
  unit.audit({ action: 'update', detail: { purposesOrdered: ids.length } })
}

/**
 * Makes a starting list of purposes (SP-07), only while there are none, so a second press or a
 * second administrator makes nothing twice.
 */
export function startPurposes(unit: UnitView, list: StartingList): number {
  const made = startingPurposes(list)
  const at = nowMs()
  const rows = made.map((p, i) => ({ id: newId('bpu'), slug: p.slug, name: p.name, tier: p.tier, openTo: p.openTo, needsProduction: p.needsProduction ? 1 : 0, approval: p.approval, canBeBumped: p.canBeBumped ? 1 : 0, sort: i + 1 }))
  unit.add({
    sql: `INSERT INTO spaces_purposes (id, slug, name, tier, open_to, needs_production, approval, can_be_bumped, sort, created_at, updated_at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.slug'), json_extract(value, '$.name'), json_extract(value, '$.tier'), json_extract(value, '$.openTo'),
                 json_extract(value, '$.needsProduction'), json_extract(value, '$.approval'), json_extract(value, '$.canBeBumped'), json_extract(value, '$.sort'), ?, ?
            FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM spaces_purposes)`,
    params: [at, at, JSON.stringify(rows)],
  }).expect(rows.length, { code: 'spaces.purposes.started', reason: 'Purposes have been set up already.', remedy: 'Reload the list.' })
  unit.audit({ action: 'create', detail: { startingPurposes: list, count: rows.length } })
  return rows.length
}

// ---- Following core -------------------------------------------------------------------------------

/** A space's control follows core's managed flag (rule C6). An external contact goes when it becomes ours. */
export function followManaged(unit: UnitView, spaceId: string, managed: boolean): void {
  unit.add({
    sql: 'UPDATE spaces_bookables SET control = ?, external_contact = CASE WHEN ? = \'own\' THEN NULL ELSE external_contact END, updated_at = ? WHERE space_id = ? AND control != ?',
    params: [managed ? 'own' : 'external', managed ? 'own' : 'external', nowMs(), spaceId, managed ? 'own' : 'external'],
  })
}

/** A space, or every space of a venue, was archived: its bookable is archived too (rule L4). */
export function followArchived(unit: UnitView, where: { spaceId: string } | { venueId: string }): void {
  const scope = 'spaceId' in where ? 'space_id = ?' : 'space_id IN (SELECT id FROM core_spaces WHERE venue_id = ?)'
  unit.add({
    sql: `UPDATE spaces_bookables SET state = 'archived', updated_at = ? WHERE state != 'archived' AND ${scope}`,
    params: [nowMs(), 'spaceId' in where ? where.spaceId : where.venueId],
  })
}
