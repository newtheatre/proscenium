import { db } from '@nuxthub/db'
import { barCategories, barDiscounts, barPrices, barProducts } from '~~/server/db/schema/bar'

/** A believable bar, so the catalogue and the till have something to show. */
export async function seedBar() {
  console.log('🍺 Seeding the bar...')

  const categories = await db.insert(barCategories).values([
    { id: 'cat-beer', name: 'Beer & cider', sort: 1 },
    { id: 'cat-wine', name: 'Wine', sort: 2 },
    { id: 'cat-spirits', name: 'Spirits', sort: 3 },
    { id: 'cat-soft', name: 'Soft & snacks', sort: 4 },
  ]).returning()

  // A glass points at the bottle it comes out of; everything else at itself
  // (docs/13 §3.1). 175ml of a 750ml bottle is 233 thousandths.
  const products = [
    { id: 'p-neckoil', categoryId: 'cat-beer', name: 'Neck Oil', unit: 'can' as const, price: 420, par: 24000 },
    { id: 'p-lager', categoryId: 'cat-beer', name: 'Lager', unit: 'bottle' as const, price: 380, par: 24000 },
    { id: 'p-cider', categoryId: 'cat-beer', name: 'Cider', unit: 'bottle' as const, price: 400, par: 12000 },
    { id: 'p-white-btl', categoryId: 'cat-wine', name: 'House white (750ml bottle)', unit: 'bottle' as const, price: 1400, par: 6000 },
    { id: 'p-red-btl', categoryId: 'cat-wine', name: 'House red (750ml bottle)', unit: 'bottle' as const, price: 1400, par: 6000 },
    { id: 'p-gin', categoryId: 'cat-spirits', name: 'Gin (700ml bottle)', unit: 'bottle' as const, price: 2000, par: 2000 },
    { id: 'p-crisps', categoryId: 'cat-soft', name: 'Crisps', unit: 'each' as const, price: 100, par: 30000, age: false },
    { id: 'p-cola', categoryId: 'cat-soft', name: 'Cola', unit: 'can' as const, price: 150, par: 24000, age: false },
  ]

  await db.insert(barProducts).values(products.map(p => ({
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    unit: p.unit,
    stockProductId: p.id,
    depletesMilli: 1000,
    parMilli: p.par,
    ageRestricted: p.age ?? true,
  })))

  await db.insert(barProducts).values([
    {
      id: 'p-white-175',
      categoryId: 'cat-wine',
      name: 'House white, 175ml glass',
      unit: 'glass' as const,
      stockProductId: 'p-white-btl',
      depletesMilli: 233,
      ageRestricted: true,
    },
    {
      id: 'p-gin-25',
      categoryId: 'cat-spirits',
      name: 'Gin, 25ml',
      unit: 'measure' as const,
      stockProductId: 'p-gin',
      depletesMilli: 36,
      ageRestricted: true,
    },
  ])

  const today = new Date().toISOString().slice(0, 10)
  await db.insert(barPrices).values([
    ...products.map(p => ({ productId: p.id, pricePence: p.price, effectiveFrom: today })),
    { productId: 'p-white-175', pricePence: 450, effectiveFrom: today },
    { productId: 'p-gin-25', pricePence: 300, effectiveFrom: today },
  ])

  await db.insert(barDiscounts).values([
    { name: 'Committee', percent: 20, sort: 1 },
    { name: 'Cast & crew', percent: 10, sort: 2 },
  ])

  console.log(`   ${categories.length} categories, ${products.length + 2} products, 2 discounts`)
}
