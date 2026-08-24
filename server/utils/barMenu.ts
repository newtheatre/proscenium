import { db, schema } from '@nuxthub/db'

/**
 * What the till has to ask before it can ring something up: one slot per
 * choice in a recipe, with the products that may fill it (ADR-0036).
 */

export interface ChoiceSlot {
  itemId: string
  categoryId: string
  categoryName: string
  /** How much of the chosen product one sale takes, in its own basis. */
  qty: number
}

export async function choiceSlots() {
  const [catalogue, products, categories] = await Promise.all([
    depletionRules(),
    db.select({ id: schema.barProducts.id, name: schema.barProducts.name }).from(schema.barProducts),
    db.select({ id: schema.barCategories.id, name: schema.barCategories.name }).from(schema.barCategories),
  ])
  const productName = new Map(products.map(p => [p.id, p.name]))
  const categoryName = new Map(categories.map(c => [c.id, c.name]))

  const slots = new Map<string, ChoiceSlot[]>()
  const options: Record<string, { id: string, name: string }[]> = {}

  for (const product of catalogue.values()) {
    const choices = product.recipe.filter(item => item.choiceCategoryId)
    if (!choices.length) continue
    slots.set(product.id, choices.map(item => ({
      itemId: item.id,
      categoryId: item.choiceCategoryId!,
      categoryName: categoryName.get(item.choiceCategoryId!) ?? 'Options',
      qty: item.qty,
    })))
    for (const item of choices) {
      options[item.choiceCategoryId!] ??= choicePool(item.choiceCategoryId!, catalogue)
        .map(p => ({ id: p.id, name: productName.get(p.id) ?? 'Item' }))
    }
  }

  return { slots, options }
}
