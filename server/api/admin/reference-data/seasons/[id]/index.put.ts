import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { seasonForm } from '#shared/utils/seasons'

// Edit a season. Retiring or bringing one back is its own action (D-131 criterion 6).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await seasonById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such season' })

  const input = await readValidatedBodyOrThrow(event, seasonForm)

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE seasons
    SET name = ${input.name}, starts_on = ${input.startsOn}, ends_on = ${input.endsOn}, sort = ${input.sort}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM seasons WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await seasonNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such season' })
    throw createError({ statusCode: 409, statusMessage: `A season is already called ${taken.name}` })
  }

  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'season.updated',
    target: `season:${id}`,
    detail: changes({
      name: [held.name, input.name],
      startsOn: [held.startsOn, input.startsOn],
      endsOn: [held.endsOn, input.endsOn],
      sort: [held.sort, input.sort],
    }),
  }))

  return { ok: true }
})
