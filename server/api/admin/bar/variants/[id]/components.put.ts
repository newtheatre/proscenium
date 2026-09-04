import { sql } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'
import { componentsForm, saysQuantity } from '#shared/utils/bar'
import type { BatchItem } from 'drizzle-orm/batch'

// Set what pouring one of these consumes. Editing affects future sales only: movements already
// written are never restated (F-113 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const { components } = await readValidatedBodyOrThrow(event, componentsForm)

  // One statement for every ingredient named. The list comes from the request and the schema caps
  // it, so the parameter count is bounded by what was sent rather than by what is stored (0003).
  const named = components.map(component => component.itemId)
  const usable = named.length === 0
    ? []
    : await db.all<{ id: string, name: string, status: string }>(sql`
      SELECT id, name, status FROM bar_items WHERE id IN (${sql.join(named.map(id => sql`${id}`), sql`, `)})
    `)

  if (usable.length !== named.length) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  const retired = usable.find(item => item.status === 'RETIRED')
  if (retired) {
    throw createError({
      statusCode: 409,
      statusMessage: `${retired.name} is retired, so nothing can be poured from it: put it back or choose another`,
    })
  }

  // The choice a variant offers is F-113's to set, so this replaces the stocked ingredients and
  // leaves any choice group where it is.
  const statements: BatchItem<'sqlite'>[] = [
    db.delete(schema.variantComponents).where(sql`variant_id = ${id} AND item_id IS NOT NULL`),
    ...components.map(component => db.insert(schema.variantComponents).values({
      id: newId(),
      variantId: id,
      itemId: component.itemId,
      qty: component.qty,
    })),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.variant.recipe.changed',
      target: `bar-variant:${id}`,
      detail: { components: components.length, depletes: components.map(component => component.itemId) },
    })),
  ]

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  const after = await variantById(id, londonDayOf(new Date()))
  return {
    ok: true,
    depletes: (after?.components ?? [])
      .filter(component => component.itemId !== null)
      .map(component => `${component.itemName}, ${saysQuantity(component.qty, component.unit ?? 'ITEM')}`),
  }
})
