import { and, asc, eq, like, or, sql } from 'drizzle-orm'
import { BOUND_PARAMETER_CHUNK, chunked } from '#shared/utils/approvals'
import type { SpaceNote, Verdict } from '#shared/utils/external-spaces'

// Reading the SU catalogue (C-119). Searched rather than listed: the union has hundreds of rooms
// and shipping them all to a dropdown would be a page nobody could use.

export interface SpaceRow {
  id: string
  name: string
  campus: string | null
  building: string | null
  contact: string | null
  capacity: number | null
  isActive: boolean
}

export async function findSpace(id: string): Promise<SpaceRow | undefined> {
  const [row] = await db.select(SPACE_COLUMNS).from(schema.externalSpaces)
    .where(eq(schema.externalSpaces.id, id)).limit(1)
  return row
}

const SPACE_COLUMNS = {
  id: schema.externalSpaces.id,
  name: schema.externalSpaces.name,
  campus: schema.externalSpaces.campus,
  building: schema.externalSpaces.building,
  contact: schema.externalSpaces.contact,
  capacity: schema.externalSpaces.capacity,
  isActive: schema.externalSpaces.isActive,
}

// Bounded by the limit rather than by the caller's patience: a picker asks for ten.
export async function searchSpaces(term: string, limit: number, includeRetired = false): Promise<SpaceRow[]> {
  const wanted = `%${term.trim().toLowerCase()}%`

  return db.select(SPACE_COLUMNS)
    .from(schema.externalSpaces)
    .where(and(
      includeRetired ? undefined : eq(schema.externalSpaces.isActive, true),
      term.trim()
        ? or(
            like(sql`lower(${schema.externalSpaces.name})`, wanted),
            like(sql`lower(coalesce(${schema.externalSpaces.building}, ''))`, wanted),
            like(sql`lower(coalesce(${schema.externalSpaces.campus}, ''))`, wanted),
          )
        : undefined,
    ))
    .orderBy(asc(schema.externalSpaces.name))
    .limit(limit)
}

export interface NoteRow extends SpaceNote {
  id: string
  by: string | null
  updatedAt: number
}

// Every note for a set of spaces, or for one purpose across all of them, so a picker showing ten
// rooms is not ten round trips. Split at 90, because the ids come from a result set (0003, 0006).
export async function notesFor(where: { spaceIds?: string[], purpose?: string }): Promise<NoteRow[]> {
  if (where.spaceIds && where.spaceIds.length === 0) return []
  if (where.spaceIds && where.spaceIds.length > BOUND_PARAMETER_CHUNK) {
    const found: NoteRow[] = []
    for (const batch of chunked(where.spaceIds)) found.push(...await notesFor({ ...where, spaceIds: batch }))
    return found
  }

  const rows = await db.select({
    id: schema.externalSpaceNotes.id,
    spaceId: schema.externalSpaceNotes.spaceId,
    purpose: schema.externalSpaceNotes.purpose,
    verdict: schema.externalSpaceNotes.verdict,
    reason: schema.externalSpaceNotes.reason,
    by: schema.users.name,
    updatedAt: schema.externalSpaceNotes.updatedAt,
  })
    .from(schema.externalSpaceNotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.externalSpaceNotes.writtenBy))
    .where(and(
      where.purpose ? eq(schema.externalSpaceNotes.purpose, where.purpose) : undefined,
      where.spaceIds?.length
        ? sql`${schema.externalSpaceNotes.spaceId} IN (${sql.join(where.spaceIds.map(id => sql`${id}`), sql`, `)})`
        : undefined,
    ))
    .orderBy(asc(schema.externalSpaceNotes.purpose))

  return rows.map(row => ({ ...row, verdict: row.verdict as Verdict }))
}
