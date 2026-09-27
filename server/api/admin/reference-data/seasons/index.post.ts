import { sql } from 'drizzle-orm'
import { seasonForm } from '#shared/utils/seasons'

// Add a season. The name is held once, whatever the capitals, and an overlap is named, never
// refused (D-131 criterion 2).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, seasonForm)
  const id = newId()

  const created = await auditedWrite(db.all<{ id: string }>(sql`
    INSERT INTO seasons (id, name, starts_on, ends_on, archived)
    SELECT ${id}, ${input.name}, ${input.startsOn}, ${input.endsOn}, 0
    WHERE NOT EXISTS (SELECT 1 FROM seasons WHERE name = ${input.name} COLLATE NOCASE)
    RETURNING id
  `), auditEntry({
    actorId: resolved.account.id,
    action: 'season.created',
    target: `season:${id}`,
    detail: { name: input.name, startsOn: input.startsOn, endsOn: input.endsOn },
  }))

  if (!created) {
    const taken = await seasonNamed(input.name)
    throw createError({ statusCode: 409, statusMessage: `A season is already called ${taken?.name ?? input.name}` })
  }

  return { ok: true, id, overlaps: await seasonOverlaps(input.startsOn, input.endsOn, id) }
})
