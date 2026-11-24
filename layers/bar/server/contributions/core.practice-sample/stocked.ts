// Sample set bar.stocked (Practice mode, part 4; BAR-59): a bar outlet at tonight's space selling from
// Standard, with spirits and beer that need the age check, soft drinks and snacks that do not, a gin
// and tonic made by its recipe from two stock items, and a delivery received so the stock is there.
// Made with the bar's own services, so it works where the real bar has no catalogue yet.
import { all, createUnit, definePracticeSample, useSetting, wordsFrom, type UnitView } from '#kit'
import { addCategory, addOutlet, addProduct } from '../../catalogue'
import { addLocation, addStockItem, setRecipe } from '../../stock'
import { addDelivery, receiveDelivery } from '../../stock-moves'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)

type Item = 'gin' | 'tonic' | 'lager' | 'cola' | 'crisps'
type Category = 'spirits' | 'beer' | 'soft'

/** Each stock item, counted by its pack, and how many packs the delivery brings. */
const STOCK: Record<Item, { name: string, baseUnit: 'ml' | 'each', packSize: number, packName: string, countUnitSize: number, packs: number }> = {
  gin: { name: 'bar.practice.stock.gin', baseUnit: 'ml', packSize: 700, packName: 'bar.practice.pack.bottle', countUnitSize: 700, packs: 2 }, // not-policy: a practice delivery
  tonic: { name: 'bar.practice.stock.tonic', baseUnit: 'each', packSize: 24, packName: 'bar.practice.pack.case', countUnitSize: 1, packs: 1 }, // not-policy: a practice delivery
  lager: { name: 'bar.practice.stock.lager', baseUnit: 'ml', packSize: 50000, packName: 'bar.practice.pack.keg', countUnitSize: 50000, packs: 1 }, // not-policy: a practice delivery
  cola: { name: 'bar.practice.stock.cola', baseUnit: 'each', packSize: 24, packName: 'bar.practice.pack.case', countUnitSize: 1, packs: 1 }, // not-policy: a practice delivery
  crisps: { name: 'bar.practice.stock.crisps', baseUnit: 'each', packSize: 48, packName: 'bar.practice.pack.box', countUnitSize: 1, packs: 1 }, // not-policy: a practice delivery
}

const CATEGORIES: Record<Category, { name: string, restricted: boolean }> = {
  spirits: { name: 'bar.practice.category.spirits', restricted: true },
  beer: { name: 'bar.practice.category.beer', restricted: true },
  soft: { name: 'bar.practice.category.soft', restricted: false },
}

/** What the outlet sells: each product's one size, its Standard price and its recipe in base units. */
const SIZES: { category: Category, name: string, size?: string, priceMinor: number, recipe: [Item, number][] }[] = [
  { category: 'spirits', name: 'bar.practice.product.gin-and-tonic', size: 'bar.practice.size.single', priceMinor: 550, recipe: [['gin', 25], ['tonic', 1]] }, // not-policy: a practice price and measure
  { category: 'beer', name: 'bar.practice.product.lager', size: 'bar.practice.size.pint', priceMinor: 480, recipe: [['lager', 568]] }, // not-policy: a practice price and a pint
  { category: 'soft', name: 'bar.practice.product.cola', priceMinor: 220, recipe: [['cola', 1]] }, // not-policy: a practice price
  { category: 'soft', name: 'bar.practice.product.crisps', priceMinor: 150, recipe: [['crisps', 1]] }, // not-policy: a practice price
]

const ITEMS = Object.keys(STOCK) as Item[]

/** The categories, stock items, location and outlet; the products follow in a unit of their own, for size. */
async function catalogue(spaceId: string | null, by: string) {
  const unit = createUnit()
  const v = unit.view()
  const categories = Object.fromEntries(Object.entries(CATEGORIES).map(([key, c]) => [key, addCategory(v, { name: t(c.name), ageRestricted: c.restricted })])) as Record<Category, string>
  const items = {} as Record<Item, string>
  for (const key of ITEMS) {
    const { name, packName, baseUnit, packSize, countUnitSize } = STOCK[key]
    items[key] = await addStockItem(v, { name: t(name), packName: t(packName), baseUnit, packSize, countUnitSize })
  }
  const locationId = addLocation(v, { name: t('bar.practice.location'), spaceId })
  addOutlet(v, { name: t('bar.practice.outlet'), kind: 'bar', spaceId, stockLocationId: locationId })
  await unit.commit()
  const products = createUnit()
  const variants: string[] = []
  for (const s of SIZES) {
    const made = await addProduct(products.view(), { categoryId: categories[s.category], name: t(s.name), ageRestricted: null }, { name: s.size && t(s.size), amountMinor: s.priceMinor }, by)
    variants.push(made.variantId)
  }
  await products.commit()
  return { variants, items, locationId }
}

/** Each size's recipe and a delivery of every item, drafted for the sample's own unit to receive. */
async function recipesAndDelivery(made: Awaited<ReturnType<typeof catalogue>>, by: string): Promise<string> {
  const unit = createUnit()
  for (const [i, s] of SIZES.entries()) {
    await setRecipe(unit.view(), made.variants[i]!, { lines: s.recipe.map(([item, quantity]) => ({ stockItemId: made.items[item], quantity })) })
  }
  const deliveryId = await addDelivery(unit.view(), { locationId: made.locationId, lines: ITEMS.map(key => ({ stockItemId: made.items[key], packs: STOCK[key].packs, looseUnits: 0 })) }, by)
  await unit.commit()
  return deliveryId
}

async function seed(unit: UnitView, by: string, tonight: string | undefined): Promise<Record<string, string>> {
  const [place] = await all<{ space_id: string }>('SELECT space_id FROM core_performances WHERE id = ?', tonight)
  const made = await catalogue(place?.space_id ?? null, by)
  await receiveDelivery(unit, await recipesAndDelivery(made, by), by)
  // Refusing after the age check is a task only where the theatre has the check on.
  return await useSetting('bar.age-check.enabled') ? { ageCheck: 'yes' } : {}
}

export default definePracticeSample({
  after: ['core.tonight'],
  seed: (unit, { staffId, results }) => seed(unit, staffId, results.tonight),
})
