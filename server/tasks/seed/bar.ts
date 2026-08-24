import { db } from '@nuxthub/db'
import { barCategories, barDiscounts, barPrices, barProducts } from '~~/server/db/schema/bar'

/** A believable bar, so the catalogue and the till have something to show. */
export async function seedBar() {
  console.log('🍺 Seeding the bar...')

  const categories = await db.insert(barCategories).values([
    { id: 'cat-beer', name: 'Beer & cider', sort: 1 },
    { id: 'cat-wine', name: 'Wine', sort: 2 },
    { id: 'cat-spirits', name: 'Spirits', sort: 3 },
    { id: 'cat-mixers', name: 'Mixers', sort: 4 },
    { id: 'cat-soft', name: 'Soft & snacks', sort: 5 },
  ]).returning()

  // A container size means the product is counted in millilitres; without one
  // it is counted in whole items, and par is in whichever it is (ADR-0035).
  const stock = [
    { id: 'p-neckoil', categoryId: 'cat-beer', name: 'Neck Oil', unit: 'can' as const, price: 420, par: 24 },
    { id: 'p-lager', categoryId: 'cat-beer', name: 'Lager', unit: 'bottle' as const, price: 380, par: 24 },
    { id: 'p-cider', categoryId: 'cat-beer', name: 'Cider', unit: 'bottle' as const, price: 400, par: 12 },
    { id: 'p-white-btl', categoryId: 'cat-wine', name: 'House white', unit: 'bottle' as const, ml: 750, price: 1400, par: 4500 },
    { id: 'p-red-btl', categoryId: 'cat-wine', name: 'House red', unit: 'bottle' as const, ml: 750, price: 1400, par: 4500 },
    { id: 'p-tonic', categoryId: 'cat-mixers', name: 'Tonic water', unit: 'can' as const, price: 120, par: 24, age: false },
    { id: 'p-lemonade', categoryId: 'cat-mixers', name: 'Lemonade', unit: 'can' as const, price: 120, par: 24, age: false },
    { id: 'p-crisps', categoryId: 'cat-soft', name: 'Crisps', unit: 'each' as const, price: 100, par: 30, age: false },
    { id: 'p-cola', categoryId: 'cat-soft', name: 'Cola', unit: 'can' as const, price: 150, par: 24, age: false },
  ]

  await db.insert(barProducts).values(stock.map(p => ({
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    unit: p.unit,
    containerMl: p.ml ?? null,
    parQty: p.par,
    ageRestricted: p.age ?? true,
  })))

  // Poured only as measures, so it carries no price and reaches no till.
  await db.insert(barProducts).values({
    id: 'p-gin',
    categoryId: 'cat-spirits',
    name: 'Gin, 70 cl bottle',
    unit: 'bottle',
    containerMl: 700,
    stockOnly: true,
    parQty: 1400,
  })

  const serves = [
    { id: 'p-white-175', categoryId: 'cat-wine', name: 'House white, large glass', unit: 'glass' as const, from: 'p-white-btl', takes: 175, price: 550 },
    { id: 'p-white-125', categoryId: 'cat-wine', name: 'House white, small glass', unit: 'glass' as const, from: 'p-white-btl', takes: 125, price: 420 },
    { id: 'p-gin-single', categoryId: 'cat-spirits', name: 'Gin, single', unit: 'measure' as const, from: 'p-gin', takes: 25, price: 300 },
    { id: 'p-gin-double', categoryId: 'cat-spirits', name: 'Gin, double', unit: 'measure' as const, from: 'p-gin', takes: 50, price: 500 },
  ]

  await db.insert(barProducts).values(serves.map(s => ({
    id: s.id,
    categoryId: s.categoryId,
    name: s.name,
    unit: s.unit,
    stockProductId: s.from,
    depletesQty: s.takes,
    ageRestricted: true,
  })))

  const today = new Date().toISOString().slice(0, 10)
  await db.insert(barPrices).values([
    ...stock.map(p => ({ productId: p.id, pricePence: p.price, effectiveFrom: today })),
    ...serves.map(s => ({ productId: s.id, pricePence: s.price, effectiveFrom: today })),
  ])

  await db.insert(barDiscounts).values([
    { name: 'Committee', percent: 20, sort: 1 },
    { name: 'Cast & crew', percent: 10, sort: 2 },
  ])

  console.log(`   ${categories.length} categories, ${stock.length + serves.length + 1} products, 2 discounts`)
}
