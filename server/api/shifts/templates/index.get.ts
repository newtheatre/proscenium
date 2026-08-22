import { db, schema } from '@nuxthub/db'
import { asc, eq, isNull } from 'drizzle-orm'
import { manageShifts } from '~~/shared/utils/abilities'

/** GET /api/shifts/templates — the default rota, and any per-venue override. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const [templates, venues] = await Promise.all([
    db.select({
      id: schema.shiftTemplates.id,
      venueId: schema.shiftTemplates.venueId,
      role: schema.shiftTemplates.role,
      count: schema.shiftTemplates.count,
    }).from(schema.shiftTemplates),
    // Only venues we run: a rota for somewhere else is meaningless (ADR-0029).
    db.select({ id: schema.venues.id, name: schema.venues.name })
      .from(schema.venues)
      .where(eq(schema.venues.isExternal, false))
      .orderBy(asc(schema.venues.name)),
  ])

  const [defaults, overrides] = [
    templates.filter(t => t.venueId === null),
    templates.filter(t => t.venueId !== null),
  ]

  return {
    roles: schema.SHIFT_ROLES,
    defaults,
    overrides,
    venues,
    // Without a default, nothing is ever stamped and the rota stays empty.
    configured: defaults.length > 0,
    unusedDefault: await db.select({ id: schema.shiftTemplates.id })
      .from(schema.shiftTemplates).where(isNull(schema.shiftTemplates.venueId)).get() ?? null,
  }
})
