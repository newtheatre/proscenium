// Award types: what a theatre can give, and the few rules each carries.
import { z } from 'zod'
import { all, first, refuse } from '#kit'
import { TYPE_STATES, VISIBILITIES } from './db/schema'

export interface AwardType {
  id: string
  key: string
  name: string
  summary: string | null
  givesTicketBenefit: boolean
  onePerPerson: boolean
  defaultVisibility: typeof VISIBILITIES[number]
  state: typeof TYPE_STATES[number]
  position: number
}

const COLUMNS = 'id, key, name, summary, gives_ticket_benefit AS givesTicketBenefit, one_per_person AS onePerPerson, default_visibility AS defaultVisibility, state, position'

const toType = (row: Record<string, unknown>): AwardType => ({ ...row, givesTicketBenefit: !!row.givesTicketBenefit, onePerPerson: !!row.onePerPerson }) as unknown as AwardType

export async function getType(id: string | undefined): Promise<AwardType | null> {
  const row = id ? await first<Record<string, unknown>>(`SELECT ${COLUMNS} FROM awards_types WHERE id = ?`, id) : null
  return row ? toType(row) : null
}

export async function requireType(id: string | undefined): Promise<AwardType> {
  const type = await getType(id)
  if (!type) refuse('core.not-found', 'There is no such award.', { status: 404 })
  return type!
}

/** Every type in the theatre's order, archived ones last. */
export async function listTypes(): Promise<AwardType[]> {
  return (await all<Record<string, unknown>>(`SELECT ${COLUMNS} FROM awards_types ORDER BY state = 'archived', position, name`)).map(toType)
}

export const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/ // not-policy: the shape of an address part

export const typeFields = z.object({
  key: z.string().trim().min(1).max(60).regex(KEY), // not-policy: the shape of an address part
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound
  summary: z.string().trim().max(500).nullable(), // not-policy: a line or two
  givesTicketBenefit: z.boolean(),
  onePerPerson: z.boolean(),
  defaultVisibility: z.enum(VISIBILITIES),
  state: z.enum(TYPE_STATES),
})
export type TypeFields = z.infer<typeof typeFields>

/** Whether any award, current or revoked, names the type: it then cannot be deleted. */
export async function hasAwards(typeId: string): Promise<boolean> {
  return !!(await first('SELECT 1 FROM awards_awards WHERE type_id = ? LIMIT 1', typeId))
}
