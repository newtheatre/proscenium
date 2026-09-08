import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { PRODUCT_COLUMNS, choiceGroupOptionsQuery, componentsQuery, resolvedPriceColumns } from '#server/utils/bar'
import type { BasketLineInput, PricedBasket, PricedLine, SaleCatalogue, SaleCategory, SaleChoice, SaleProduct, SaleVariant } from '#shared/utils/sale'

// What the till may sell right now, and what pricing a basket of it costs. Neither writes
// anything: the sale itself is F-104's cross-check and F-105's atomic write (F-103).

interface VariantRow {
  id: string
  productId: string
  servingKind: string
  label: string
  pricePence: number | null
  priceSource: 'variant' | 'category' | null
}

interface ComponentRow {
  variantId: string
  choiceGroupId: string | null
  choiceGroupName: string | null
}

interface OptionRow {
  choiceGroupId: string
  id: string
  itemName: string
}

// The catalogue read every screen and every price check shares, so the two can never disagree
// about what is sellable (F-103 criterion 3).
async function activeVariantsWithChoices(on: string): Promise<Map<string, SaleVariant & { productId: string }>> {
  const { pricePence, priceSource } = resolvedPriceColumns(sql`p.category_id`, 'v', on)
  const variants = await db.all<VariantRow>(sql`
    SELECT v.id AS id, v.product_id AS productId, v.serving_kind AS servingKind, v.label AS label,
           ${pricePence} AS pricePence, ${priceSource} AS priceSource
    FROM product_variants v JOIN bar_products p ON p.id = v.product_id
    WHERE v.status = 'ACTIVE' AND p.status = 'ACTIVE'
    ORDER BY v.sort, v.label COLLATE NOCASE
  `)
  // Unpriced is unsellable, not a broken button: excluded here rather than drawn disabled (0017).
  const priced = variants.filter((row): row is VariantRow & { pricePence: number, priceSource: 'variant' | 'category' } =>
    row.pricePence !== null && row.priceSource !== null)

  const components = await db.all<ComponentRow>(componentsQuery(sql`SELECT id FROM product_variants WHERE status = 'ACTIVE'`))
  const options = await db.all<OptionRow>(choiceGroupOptionsQuery(sql`
    SELECT DISTINCT choice_group_id FROM variant_components WHERE choice_group_id IS NOT NULL
  `))
  const groupNames = await db.all<{ id: string, name: string }>(sql`SELECT id, name FROM choice_groups`)
  const nameOf = new Map(groupNames.map(group => [group.id, group.name]))

  const choiceOf = new Map<string, SaleChoice>()
  for (const component of components) {
    if (!component.choiceGroupId) continue
    if (choiceOf.has(component.variantId)) continue
    choiceOf.set(component.variantId, {
      id: component.choiceGroupId,
      name: nameOf.get(component.choiceGroupId) ?? '',
      options: options
        .filter(option => option.choiceGroupId === component.choiceGroupId)
        .map(option => ({ id: option.id, itemName: option.itemName })),
    })
  }

  return new Map(priced.map(row => [row.id, {
    id: row.id,
    productId: row.productId,
    servingKind: row.servingKind as SaleVariant['servingKind'],
    label: row.label,
    pricePence: row.pricePence,
    priceSource: row.priceSource,
    choice: choiceOf.get(row.id) ?? null,
  }]))
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

  const variants = [...(await activeVariantsWithChoices(on)).values()]
  const products: SaleProduct[] = productRows
    .map(row => ({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      ageRestricted: row.ageRestricted === 1,
      allergenState: row.allergenState,
      allergenNote: row.allergenNote,
      variants: variants.filter(variant => variant.productId === row.id)
        .map(({ productId: _productId, ...variant }) => variant),
    }))
    .filter(product => product.variants.length > 0)

  return { on, categories, products }
}

// Recomputes a submitted basket against live, effective prices: never the client's own arithmetic
// (0004). A line naming a variant this cannot sell right now is refused by name (F-103 criterion 3).
export async function priceBasket(lines: BasketLineInput[], on: string): Promise<PricedBasket> {
  const variants = await activeVariantsWithChoices(on)

  // Scoped to the basket's own lines, bounded by MAX_BASKET_LINES, never to the whole catalogue
  // (0003): a basket of two should not bind a parameter per product the till has ever priced.
  interface ProductName { id: string, name: string }
  const productIds = [...new Set(lines
    .map(line => variants.get(line.variantId)?.productId)
    .filter((id): id is string => id !== undefined))]
  const productNames = productIds.length === 0
    ? []
    : await db.all<ProductName>(sql`SELECT id AS id, name AS name FROM bar_products WHERE id IN (${sql.join(productIds.map(id => sql`${id}`), sql`, `)})`)
  const nameOfProduct = new Map(productNames.map(product => [product.id, product.name]))

  const priced: PricedLine[] = lines.map((line) => {
    const variant = variants.get(line.variantId)
    if (!variant) {
      throw createError({ statusCode: 422, statusMessage: 'That size is not on the till right now' })
    }

    let choiceItemName: string | null = null
    if (variant.choice) {
      const chosen = variant.choice.options.find(option => option.id === line.choiceItemId)
      if (!chosen) {
        throw createError({ statusCode: 422, statusMessage: `${variant.label} needs a ${variant.choice.name.toLowerCase()} chosen before it can be sold` })
      }
      choiceItemName = chosen.itemName
    }
    else if (line.choiceItemId) {
      throw createError({ statusCode: 422, statusMessage: `${variant.label} takes no choice` })
    }

    return {
      variantId: variant.id,
      productName: nameOfProduct.get(variant.productId) ?? '',
      variantLabel: variant.label,
      choiceItemName,
      qty: line.qty,
      unitPricePence: variant.pricePence,
      priceSource: variant.priceSource,
      amountPence: variant.pricePence * line.qty,
    }
  })

  return { lines: priced, totalPence: priced.reduce((sum, line) => sum + line.amountPence, 0) }
}
