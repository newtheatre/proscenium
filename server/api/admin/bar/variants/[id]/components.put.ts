import { sql } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'
import { componentsForm, saysQuantity } from '#shared/utils/bar'
import type { ProductVariant } from '#shared/utils/bar'

// Set what pouring one of these consumes. Editing affects future sales only: movements already
// written are never restated (F-113 criterion 4).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw noSuch('serving size')

  const { components } = await readValidatedBodyOrThrow(event, componentsForm)

  // Served without its choice, a size pours its own items alone (F-112 criterion 3). An ACTIVE
  // one needs something a sale can deplete, and a choice group stands in for an item (F-128).
  const emptyRefusal = (variant: ProductVariant): string => variant.components.some(component => component.choiceOptional)
    ? `${variant.label} can be served without its choice, so it needs a stocked item of its own or it would sell an empty glass: keep one, or untick Can be served without one under Change choice first`
    : `${variant.label} is on the till, so it needs something for a sale to deplete: give it a stocked item or a choice group`

  if (components.length === 0) {
    const product = await productById(held.productId)
    const hasChoiceGroup = held.components.some(component => component.choiceGroupId !== null)
    const optional = held.components.some(component => component.choiceOptional)
    if (optional || (product?.status === 'ACTIVE' && !hasChoiceGroup)) {
      throw createError({ statusCode: 409, statusMessage: emptyRefusal(held) })
    }
  }

  // One statement for every ingredient named. The list comes from the request and the schema caps
  // it, so the parameter count is bounded by what was sent rather than by what is stored (0003).
  const named = components.map(component => component.itemId)
  const usable = named.length === 0
    ? []
    : await db.all<{ id: string, name: string, status: string }>(sql`
      SELECT id, name, status FROM bar_items WHERE id IN (${sql.join(named.map(id => sql`${id}`), sql`, `)})
    `)

  if (usable.length !== named.length) throw noSuch('stocked item')

  const retired = usable.find(item => item.status === 'RETIRED')
  if (retired) {
    throw createError({
      statusCode: 409,
      statusMessage: `${retired.name} is retired, so nothing can be poured from it: put it back or choose another`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.recipe.changed',
    target: `bar-variant:${id}`,
    detail: { components: components.length, depletes: components.map(component => component.itemId) },
  })

  // The choice a variant offers is F-113's to set, so this replaces the stocked ingredients and
  // leaves any choice group where it is.
  const { logged, writes } = recipeStatements(id, components, entry)
  const [landed] = await db.batch([db.all<{ id: string }>(logged), ...writes.map(statement => db.run(statement))])

  // Refused on the write only when a change landed after the read above: say what it is now.
  if ((landed as { id: string }[]).length === 0) {
    const now = await variantById(id, londonDayOf(new Date()))
    throw createError({ statusCode: 409, statusMessage: emptyRefusal(now ?? held) })
  }

  const after = await variantById(id, londonDayOf(new Date()))
  return {
    ok: true,
    depletes: (after?.components ?? [])
      .filter(component => component.itemId !== null)
      .map(component => `${component.itemName}, ${saysQuantity(component.qty, component.unit ?? 'ITEM')}`),
  }
})
