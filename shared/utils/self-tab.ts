import { z } from 'zod'
import { MAX_BASKET_LINES, basketLineForm } from '#shared/utils/sale'
import type { BasketLineInput, SaleCatalogue, SaleVariant } from '#shared/utils/sale'

// A holder adding to their own tab from My NNT, with nobody on the till (F-108 criterion 7, 0165).

export const selfTabForm = z.object({
  venueId: z.string().trim().min(1, 'Say which bar you are at'),
  lines: z.array(basketLineForm.omit({ choiceItemId: true })).min(1, 'Pick something to add').max(MAX_BASKET_LINES),
  expectedTotalPence: z.number().int().nonnegative(),
})

export type SelfTabInput = z.output<typeof selfTabForm>

// A size served with no question: nothing restricted, so no Challenge 25 is owed, and no choice
// that must be answered, which only the bar can pour.
function selfServed(variant: SaleVariant): boolean {
  return variant.ageRestricted !== true && (variant.choice === null || variant.choice.optional === true)
}

// What My NNT offers: the till's own catalogue, less anything that needs the bar to ask.
export function selfServeCatalogue(catalogue: SaleCatalogue): SaleCatalogue {
  const products = catalogue.products
    .filter(product => !product.ageRestricted)
    .map(product => ({ ...product, variants: product.variants.filter(selfServed) }))
    .filter(product => product.variants.length > 0)
  const shown = new Set(products.map(product => product.categoryId))
  return { ...catalogue, categories: catalogue.categories.filter(category => shown.has(category.id)), products }
}

// The figure the screen sends, which the server prices again and refuses on a mismatch (0004).
export function selfTabTotal(lines: Pick<BasketLineInput, 'variantId' | 'qty'>[], catalogue: SaleCatalogue): number | null {
  const prices = new Map(catalogue.products.flatMap(product => product.variants.map(variant => [variant.id, variant.pricePence] as const)))
  let total = 0
  for (const line of lines) {
    const price = prices.get(line.variantId)
    if (price === undefined) return null
    total += price * line.qty
  }
  return total
}

export const SELF_TAB_RESTRICTED = 'is served at the bar, since it needs a Challenge 25 check: ask whoever is on the till'
