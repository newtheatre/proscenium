import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { PRODUCT_COLUMNS, choiceGroupOptionsQuery, componentsQuery, resolvedPriceColumns } from '#server/utils/bar'
import { postEntry } from '#server/utils/ledger'
import { priceRef, saysMoney } from '#shared/utils/bar'
import type { AuditRow } from '#shared/utils/audit'
import type { BasketLineInput, PricedBasket, PricedLine, SaleCatalogue, SaleCategory, SaleChoice, SaleProduct, SaleReceipt, SaleVariant } from '#shared/utils/sale'
import type { BatchItem } from 'drizzle-orm/batch'

// What the till may sell right now, what pricing a basket of it costs, and committing a sale
// atomically once the till has confirmed it (F-103, F-104, F-105).

interface VariantRow {
  id: string
  productId: string
  servingKind: string
  label: string
  pricePence: number | null
  priceSource: 'variant' | 'category' | null
  priceRowId: string | null
}

interface ComponentRow {
  variantId: string
  itemId: string | null
  choiceGroupId: string | null
  choiceGroupName: string | null
  qty: number
}

interface OptionRow {
  choiceGroupId: string
  id: string
  itemId: string
  itemName: string
  qty: number
}

// One resolved ingredient a sale line depletes: an item and how much of it, in the item's own
// counting unit, before the line's own quantity is applied (F-113, F-105 criterion 1).
export interface Depletion {
  itemId: string
  qty: number
}

// Everything the catalogue, a price check and a sale commit each need about one size: the public
// `SaleVariant` shape plus what only the write path reads (F-121's `price_ref`, F-113's recipe).
interface ResolvedVariant extends SaleVariant {
  productId: string
  priceRowId: string
  recipe: Depletion[]
}

interface Resolvable {
  variants: Map<string, ResolvedVariant>
  // Keyed by the option row's id, not the item: two options in different groups could share a
  // stocked item, and it is the option chosen that says how much of it a line depletes.
  optionById: Map<string, OptionRow>
}

// The catalogue read every screen and every price check shares, so none of them can disagree
// about what is sellable (F-103 criterion 3).
async function activeVariantsWithChoices(on: string): Promise<Resolvable> {
  const { pricePence, priceSource, priceRowId } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const variantRows = await db.all<VariantRow>(sql`
    SELECT v.id AS id, v.product_id AS productId, v.serving_kind AS servingKind, v.label AS label,
           ${pricePence} AS pricePence, ${priceSource} AS priceSource, ${priceRowId} AS priceRowId
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    WHERE v.status = 'ACTIVE' AND p.status = 'ACTIVE'
    ORDER BY v.sort, v.label COLLATE NOCASE
  `)
  // Unpriced is unsellable, not a broken button: excluded here rather than drawn disabled (0017).
  const priced = variantRows.filter((row): row is VariantRow & { pricePence: number, priceSource: 'variant' | 'category', priceRowId: string } =>
    row.pricePence !== null && row.priceSource !== null && row.priceRowId !== null)

  const components = await db.all<ComponentRow>(componentsQuery(sql`SELECT id FROM product_variants WHERE status = 'ACTIVE'`))
  const options = await db.all<OptionRow>(choiceGroupOptionsQuery(sql`
    SELECT DISTINCT choice_group_id FROM variant_components WHERE choice_group_id IS NOT NULL
  `))
  const groupNames = await db.all<{ id: string, name: string }>(sql`SELECT id, name FROM choice_groups`)
  const nameOf = new Map(groupNames.map(group => [group.id, group.name]))

  const choiceOf = new Map<string, SaleChoice>()
  const recipeOf = new Map<string, Depletion[]>()
  for (const component of components) {
    if (component.itemId) {
      const recipe = recipeOf.get(component.variantId) ?? []
      recipe.push({ itemId: component.itemId, qty: component.qty })
      recipeOf.set(component.variantId, recipe)
      continue
    }
    if (!component.choiceGroupId || choiceOf.has(component.variantId)) continue
    choiceOf.set(component.variantId, {
      id: component.choiceGroupId,
      name: nameOf.get(component.choiceGroupId) ?? '',
      options: options
        .filter(option => option.choiceGroupId === component.choiceGroupId)
        .map(option => ({ id: option.id, itemName: option.itemName })),
    })
  }
  const optionById = new Map(options.map(option => [option.id, option]))

  const variants = new Map(priced.map((row) => {
    const choice = choiceOf.get(row.id) ?? null
    return [row.id, {
      id: row.id,
      productId: row.productId,
      servingKind: row.servingKind as SaleVariant['servingKind'],
      label: row.label,
      pricePence: row.pricePence,
      priceSource: row.priceSource,
      priceRowId: row.priceRowId,
      choice,
      recipe: recipeOf.get(row.id) ?? [],
    }]
  }))

  return { variants, optionById }
}

// One tile per sellable product; a product left with no priced size (the pre-F-112 activation
// gap, known-issues.md) simply has none to draw, rather than a size button with nothing behind it.
export async function sellableCatalogue(on: string): Promise<SaleCatalogue> {
  const categories = await db.all<SaleCategory>(sql`
    SELECT id AS id, name AS name, sort AS sort, colour AS colour FROM bar_categories
    ORDER BY sort, name COLLATE NOCASE
  `)

  interface ProductRow { id: string, name: string, categoryId: string, ageRestricted: number, allergenState: SaleProduct['allergenState'], allergenNote: string | null }
  const productRows = await db.all<ProductRow>(sql`
    SELECT ${PRODUCT_COLUMNS} FROM bar_products p JOIN bar_categories c ON c.id = p.category_id
    WHERE p.status = 'ACTIVE'
    ORDER BY c.sort, c.name COLLATE NOCASE, p.sort, p.name COLLATE NOCASE
  `)

  const variants = [...(await activeVariantsWithChoices(on)).variants.values()]
  const products: SaleProduct[] = productRows
    .map(row => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      ageRestricted: row.ageRestricted === 1,
      allergenState: row.allergenState,
      allergenNote: row.allergenNote,
      variants: variants.filter(variant => variant.productId === row.id)
        // Only what the screen needs: the write-path fields (price row, recipe) stay internal.
        .map(({ productId: _productId, priceRowId: _priceRowId, recipe: _recipe, ...variant }) => variant),
    }))
    .filter(product => product.variants.length > 0)

  return { on, categories, products }
}

interface ResolvedLine {
  variant: ResolvedVariant
  qty: number
  choiceItemId: string | null
  choiceItemName: string | null
  depletion: Depletion[]
  amountPence: number
}

// One basket line checked against what the till may actually sell (variant active and priced,
// choice required and valid); the chosen option depletes at its own quantity (F-113 criterion 2).
function resolveLines(lines: BasketLineInput[], { variants, optionById }: Resolvable): ResolvedLine[] {
  return lines.map((line) => {
    const variant = variants.get(line.variantId)
    if (!variant) {
      throw createError({ statusCode: 422, statusMessage: 'That size is not on the till right now' })
    }

    let choiceItemId: string | null = null
    let choiceItemName: string | null = null
    const depletion = [...variant.recipe]
    if (variant.choice) {
      const chosen = variant.choice.options.find(option => option.id === line.choiceItemId)
      const option = chosen ? optionById.get(chosen.id) : undefined
      if (!chosen || !option) {
        throw createError({ statusCode: 422, statusMessage: `${variant.label} needs a ${variant.choice.name.toLowerCase()} chosen before it can be sold` })
      }
      choiceItemId = chosen.id
      choiceItemName = chosen.itemName
      depletion.push({ itemId: option.itemId, qty: option.qty })
    }
    else if (line.choiceItemId) {
      throw createError({ statusCode: 422, statusMessage: `${variant.label} takes no choice` })
    }

    return { variant, qty: line.qty, choiceItemId, choiceItemName, depletion, amountPence: variant.pricePence * line.qty }
  })
}

// The one resolution both pricing and committing build from, called once rather than twice, so
// no price change can land between a check and its write (F-103 criterion 3, F-104 criterion 1).
async function resolveSale(lines: BasketLineInput[], on: string): Promise<{ resolved: ResolvedLine[], priced: PricedLine[], totalPence: number }> {
  const catalogue = await activeVariantsWithChoices(on)
  const resolved = resolveLines(lines, catalogue)

  // Scoped to the basket's own lines, bounded by MAX_BASKET_LINES, never to the whole catalogue
  // (0003): a basket of two should not bind a parameter per product the till has ever priced.
  interface ProductName { id: string, name: string }
  const productIds = [...new Set(resolved.map(line => line.variant.productId))]
  const productNames = productIds.length === 0
    ? []
    : await db.all<ProductName>(sql`SELECT id AS id, name AS name FROM bar_products WHERE id IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
  const nameOfProduct = new Map(productNames.map(product => [product.id, product.name]))

  const priced: PricedLine[] = resolved.map(line => ({
    variantId: line.variant.id,
    productName: nameOfProduct.get(line.variant.productId) ?? '',
    variantLabel: line.variant.label,
    choiceItemName: line.choiceItemName,
    qty: line.qty,
    unitPricePence: line.variant.pricePence,
    priceSource: line.variant.priceSource,
    amountPence: line.amountPence,
  }))

  return { resolved, priced, totalPence: priced.reduce((sum, line) => sum + line.amountPence, 0) }
}

// Recomputes a submitted basket against live, effective prices: never the client's own arithmetic
// (0004). A line naming a variant this cannot sell right now is refused by name (F-103 criterion 3).
export async function priceBasket(lines: BasketLineInput[], on: string): Promise<PricedBasket> {
  const { priced, totalPence } = await resolveSale(lines, on)
  return { lines: priced, totalPence }
}

// The cross-check (F-104) and, once it matches, the one atomic write (F-105 criterion 1): a
// ledger entry, its lines, a stock movement per ingredient, and the session's audit row, in one batch.
export async function commitSale(
  lines: BasketLineInput[],
  on: string,
  actorId: string,
  expectedTotalPence: number,
  audit: AuditRow,
): Promise<SaleReceipt> {
  const { resolved, priced, totalPence } = await resolveSale(lines, on)
  if (totalPence !== expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysMoney(expectedTotalPence)}; the till now reads ${saysMoney(totalPence)}. Nothing has been charged: check the basket and try again.`,
    })
  }

  const posted = postEntry({
    source: 'TILL',
    tender: 'CARD',
    actorId,
    lines: resolved.map(line => ({
      kind: 'BAR_ITEM',
      amountPence: line.amountPence,
      qty: line.qty,
      unitPricePence: line.variant.pricePence,
      productVariantId: line.variant.id,
      priceRef: priceRef(line.variant.priceSource, line.variant.priceRowId),
      choices: line.choiceItemId ? { choiceItemId: line.choiceItemId, choiceItemName: line.choiceItemName } : null,
    })),
  })

  const statements: BatchItem<'sqlite'>[] = [...posted.statements]
  // Every movement cites the sale line that caused it (criterion 3), which is only known once
  // `postEntry` has assigned that line's id; a movement of zero can never reach the batch (0010).
  resolved.forEach((line, index) => {
    const lineId = posted.lineIds[index]!
    for (const ingredient of line.depletion) {
      statements.push(db.insert(schema.stockMovements).values({
        id: newId(),
        itemId: ingredient.itemId,
        qty: -(ingredient.qty * line.qty),
        kind: 'SALE',
        refTable: 'ledger_lines',
        refId: lineId,
        actorId,
      }))
    }
  })
  statements.push(db.insert(schema.auditLog).values(audit))

  try {
    await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    // The trigger's predicate is what refuses an oversell (0070); a read-then-check here would
    // race the same way on-hand always must not (F-105 criterion 5), so this catches its abort.
    if (error instanceof Error && error.message.includes('stock_movements_sale_exceeds_on_hand')) {
      throw createError({ statusCode: 409, statusMessage: 'Not enough left in stock for this sale: nothing has been charged.' })
    }
    throw error
  }

  return { entryId: posted.id, totalPence: posted.totalPence, lines: priced }
}
