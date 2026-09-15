import { sql } from 'drizzle-orm'
import { auditEntry } from '#shared/utils/audit'
import { says } from '#shared/utils/bar'
import type { SQL } from 'drizzle-orm'
import type { ProductSetupInput, ProductStatus, ServingKind } from '#shared/utils/bar'

// F-127: one guided set-up becomes one batch. Every insert carries its own claim or its parent's
// existence as a predicate, so a name lost to a racer leaves nothing behind rather than a husk.

export interface SetupContext {
  actorId: string
  // The Europe/London day the opening prices take effect on (0014, F-116).
  today: string
  // Serving kinds the product's category already prices today, so a size with no price of its own
  // still resolves one (F-121, 0017).
  pricedKinds: readonly ServingKind[]
  // Names of the stocked items this set-up points at that are retired (F-113 criterion 5).
  retiredItems: readonly string[]
  newId: () => string
}

export interface SetupServing {
  servingKind: ServingKind
  label: string
  qty: number
  pricePence?: number | null
}

export interface SetupPlan {
  productId: string
  itemId: string | null
  variantIds: readonly string[]
  choiceGroupId: string | null
  status: ProductStatus
  // Why the product is hidden, in the bar's own words, or null when it went on the till.
  reason: string | null
  statements: readonly SQL[]
}

// What each shape sells as. A recipe pours its components rather than a measure of one item, so
// its serving depletes nothing of its own.
function servingsOf(input: ProductSetupInput): SetupServing[] {
  if (input.shape === 'MEASURED') return input.sizes
  if (input.shape === 'SIMPLE') return [input.serving]
  return [{ ...input.serving, qty: 0 }]
}

function whyHidden(unpriced: SetupServing[], retired: readonly string[]): string | null {
  const parts: string[] = []
  if (unpriced.length > 0) {
    parts.push(`nothing prices ${unpriced.map(serving => says(serving.servingKind)).join(', ')}`)
  }
  if (retired.length > 0) {
    parts.push(`${retired.join(', ')} ${retired.length === 1 ? 'is' : 'are'} retired`)
  }
  return parts.length === 0 ? null : `Hidden until it resolves: ${parts.join('; ')}.`
}

function auditStatement(
  actorId: string,
  action: string,
  target: string,
  detail: Record<string, unknown>,
  guard: SQL,
): SQL {
  const entry = auditEntry({ actorId, action, target, detail })
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
    WHERE ${guard}
  `
}

export function planProductSetup(input: ProductSetupInput, context: SetupContext): SetupPlan {
  const productId = context.newId()
  const statements: SQL[] = []
  const servings = servingsOf(input)
  const product = input.product

  const unpriced = servings.filter(serving =>
    (serving.pricePence ?? null) === null && !context.pricedKinds.includes(serving.servingKind))
  const reason = whyHidden(unpriced, context.retiredItems)
  const status: ProductStatus = reason === null ? 'ACTIVE' : 'HIDDEN'

  // Both claims guard both inserts: a product losing its name must not leave a stocked item
  // behind, and neither must a stocked item losing its own (F-127 criterion 4).
  const productFree = sql`NOT EXISTS (SELECT 1 FROM bar_products WHERE name = ${product.name} COLLATE NOCASE)`
  const newItem = input.shape !== 'RECIPE' && input.item.mode === 'NEW' ? input.item.item : null
  const itemFree = newItem
    ? sql`NOT EXISTS (SELECT 1 FROM bar_items WHERE name = ${newItem.name} COLLATE NOCASE)`
    : sql`1 = 1`
  const itemId = input.shape === 'RECIPE'
    ? null
    : input.item.mode === 'EXISTING' ? input.item.itemId : context.newId()

  if (newItem && itemId) {
    statements.push(sql`
      INSERT INTO bar_items (id, name, unit, container_ml, par_qty, category, age_restricted, allergen_notes, status)
      SELECT ${itemId}, ${newItem.name}, ${newItem.unit}, ${newItem.containerMl ?? null}, ${newItem.parQty ?? null},
             ${newItem.category ?? null}, ${newItem.ageRestricted ? 1 : 0}, ${newItem.allergenNotes ?? null}, 'ACTIVE'
      WHERE ${itemFree} AND ${productFree}
    `)
    statements.push(auditStatement(context.actorId, 'bar.item.created', `bar-item:${itemId}`, {
      name: newItem.name,
      unit: newItem.unit,
    }, sql`EXISTS (SELECT 1 FROM bar_items WHERE id = ${itemId})`))
  }

  // The item is written first, so its claim is proved by its row rather than by its name, which
  // this same batch has just taken.
  const itemHeld = newItem && itemId
    ? sql`EXISTS (SELECT 1 FROM bar_items WHERE id = ${itemId})`
    : sql`1 = 1`

  statements.push(sql`
    INSERT INTO bar_products (id, category_id, name, status, staffed_only, age_restricted, allergen_state, allergen_note, sort)
    SELECT ${productId}, ${product.categoryId}, ${product.name}, ${status}, ${product.staffedOnly ? 1 : 0},
           ${product.ageRestricted ? 1 : 0}, ${product.allergenState}, ${product.allergenNote ?? null}, ${product.sort}
    WHERE ${productFree} AND ${itemHeld}
  `)

  const landed = sql`EXISTS (SELECT 1 FROM bar_products WHERE id = ${productId})`

  statements.push(auditStatement(context.actorId, 'bar.product.created', `bar-product:${productId}`, {
    name: product.name,
    categoryId: product.categoryId,
    ageRestricted: product.ageRestricted,
    allergenState: product.allergenState,
    shape: input.shape,
    status,
  }, landed))

  let choiceGroupId: string | null = null
  if (input.shape === 'RECIPE' && input.choice) {
    choiceGroupId = context.newId()
    statements.push(sql`
      INSERT INTO choice_groups (id, name)
      SELECT ${choiceGroupId}, ${input.choice.group.name}
      WHERE ${landed}
    `)
    statements.push(auditStatement(context.actorId, 'bar.choice-group.created', `bar-choice-group:${choiceGroupId}`, {
      name: input.choice.group.name,
      options: input.choice.group.options.length,
    }, sql`EXISTS (SELECT 1 FROM choice_groups WHERE id = ${choiceGroupId})`))

    input.choice.group.options.forEach((option, index) => {
      statements.push(sql`
        INSERT INTO choice_group_items (id, choice_group_id, item_id, qty, sort)
        SELECT ${context.newId()}, ${choiceGroupId}, ${option.itemId}, ${option.qty}, ${index}
        WHERE EXISTS (SELECT 1 FROM choice_groups WHERE id = ${choiceGroupId})
      `)
    })
  }

  const variantIds: string[] = []
  servings.forEach((serving, index) => {
    const variantId = context.newId()
    variantIds.push(variantId)

    statements.push(sql`
      INSERT INTO product_variants (id, product_id, serving_kind, label, status, sort)
      SELECT ${variantId}, ${productId}, ${serving.servingKind}, ${serving.label}, 'ACTIVE', ${index}
      WHERE ${landed}
    `)

    const variantLanded = sql`EXISTS (SELECT 1 FROM product_variants WHERE id = ${variantId})`

    statements.push(auditStatement(context.actorId, 'bar.variant.created', `bar-variant:${variantId}`, {
      productId,
      servingKind: serving.servingKind,
      label: serving.label,
    }, variantLanded))

    if (input.shape === 'RECIPE') {
      for (const component of input.components) {
        statements.push(sql`
          INSERT INTO variant_components (id, variant_id, item_id, qty)
          SELECT ${context.newId()}, ${variantId}, ${component.itemId}, ${component.qty}
          WHERE ${variantLanded}
        `)
      }
      if (choiceGroupId && input.choice) {
        statements.push(sql`
          INSERT INTO variant_components (id, variant_id, choice_group_id, qty, included_in_price)
          SELECT ${context.newId()}, ${variantId}, ${choiceGroupId}, ${input.choice.qty}, ${input.choice.includedInPrice ? 1 : 0}
          WHERE ${variantLanded}
        `)
      }
    }
    else if (itemId) {
      statements.push(sql`
        INSERT INTO variant_components (id, variant_id, item_id, qty)
        SELECT ${context.newId()}, ${variantId}, ${itemId}, ${serving.qty}
        WHERE ${variantLanded}
      `)
    }

    // A price row only where a price was typed: a size the category prices inherits that default
    // rather than being given a copy of it that a later change would not reach (0017, F-121).
    if ((serving.pricePence ?? null) !== null) {
      statements.push(sql`
        INSERT INTO variant_prices (id, variant_id, price_pence, effective_from, created_by)
        SELECT ${context.newId()}, ${variantId}, ${serving.pricePence}, ${context.today}, ${context.actorId}
        WHERE ${variantLanded}
      `)
    }
  })

  if (input.shape !== 'RECIPE' && input.opening && itemId) {
    statements.push(sql`
      INSERT INTO stock_movements (id, item_id, qty, kind, unit_cost_pence, actor_id)
      SELECT ${context.newId()}, ${itemId}, ${input.opening.qty}, 'DELIVERY',
             ${input.opening.unitCostPence ?? null}, ${context.actorId}
      WHERE ${landed}
    `)
  }

  return { productId, itemId, variantIds, choiceGroupId, status, reason, statements }
}
