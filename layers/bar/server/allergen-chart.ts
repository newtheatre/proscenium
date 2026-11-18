// Allergens, build step 3: the public chart, what still needs a label read, and the re-check prompt on
// deliveries. The chart is each outlet's menu with the till's own answers, so it never disagrees with
// the till: contains, may contain, or not checked. It never says "free from".
import { all, nowMs, useSetting } from '#kit'
import { allergenAnswers, allergenSettings, sizeAnswer, stockLinks, type Allergen } from './allergens'
import { menu, outlets, priceLists } from './catalogue'

export interface ChartAnswer { contains: Allergen[], mayContain: Allergen[], checked: boolean }
export interface ChartRow {
  variantId: string
  product: string
  size: string
  allergens: ChartAnswer & { dependsOnChoice: boolean }
  choices: { group: string, options: { label: string, allergens: ChartAnswer }[] }[]
}
export interface Chart {
  statement: string | null
  // Every size on sale has been checked: until then the page says what has not.
  complete: boolean
  outlets: { id: string, name: string, categories: { name: string, rows: ChartRow[] }[] }[]
}

/** The public chart, or null when allergens are off or the theatre does not publish it. */
export async function allergenChart(): Promise<Chart | null> {
  const settings = await allergenSettings()
  if (!settings.enabled || !settings.publish) return null
  const out: Chart['outlets'] = []
  let complete = true
  const links = await stockLinks()
  const lists = new Set((await priceLists()).filter(l => l.active).map(l => l.id))
  // An outlet whose price list has been retired sells nothing, so it has no chart.
  for (const outlet of (await outlets()).filter(o => o.active && lists.has(o.priceListId))) {
    const m = await menu(outlet.id)
    const groups = new Map(m.groups.map(g => [g.id, g]))
    const categories = m.categories.map(c => ({
      name: c.name,
      rows: c.items.map((i): ChartRow => {
        const allergens = i.allergens ?? { contains: [], mayContain: [], checked: false, dependsOnChoice: false }
        if (!allergens.checked) complete = false
        const choices = i.groupIds.flatMap((id) => {
          const g = groups.get(id)
          return g ? [{ group: g.name, options: g.options.map(o => ({ label: o.label, allergens: (o as { allergens?: ChartAnswer }).allergens ?? { contains: [], mayContain: [], checked: false } })) }] : []
        })
        // A size made from nothing but choices is only as checked as the options it offers.
        if (links.choiceOnly.has(i.variantId) && choices.some(c => c.options.some(o => !o.allergens.checked))) complete = false
        return {
          variantId: i.variantId,
          product: i.product,
          size: i.variant,
          allergens,
          choices,
        }
      }),
    })).filter(c => c.rows.length)
    if (categories.length) out.push({ id: outlet.id, name: outlet.name, categories })
  }
  return { statement: settings.statement, complete, outlets: out }
}

/** How many sizes on sale have not had every label read: for the bar managers' home card. */
export async function uncheckedSizes(): Promise<number> {
  const settings = await allergenSettings()
  if (!settings.enabled) return 0
  const answers = await allergenAnswers()
  const links = await stockLinks()
  const sizes = await all<{ id: string, product_id: string }>(
    `SELECT v.id, v.product_id FROM bar_variants v JOIN bar_products p ON p.id = v.product_id
      WHERE v.active = 1 AND p.active = 1 AND v.mixer_measure = 0`,
  )
  return sizes.filter(v => !sizeAnswer(answers, links, v.id, v.product_id)?.checked).length
}

/**
 * The stock items on a delivery whose label is due a fresh look: never checked, or last checked
 * longer ago than bar.allergens.recheck-every. Receiving is when a new label arrives.
 */
export async function labelsDue(stockItemIds: string[]): Promise<{ stockItemId: string, name: string, checkedAt: number | null }[]> {
  if (!stockItemIds.length || !(await useSetting('bar.allergens.enabled') as boolean)) return []
  const every = await useSetting('bar.allergens.recheck-every') as number
  const { stockItems } = await allergenAnswers()
  const names = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM bar_stock_items WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(stockItemIds))).map(i => [i.id, i.name] as const))
  const due = nowMs() - every * 1000 // not-policy: seconds to milliseconds
  return stockItemIds.flatMap((id) => {
    const a = stockItems.get(id)
    return !a?.checked || (a.checkedAt ?? 0) < due ? [{ stockItemId: id, name: names.get(id) ?? '', checkedAt: a?.checkedAt ?? null }] : []
  })
}
