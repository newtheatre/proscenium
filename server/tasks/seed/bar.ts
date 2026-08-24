import { db } from '@nuxthub/db'
import { barCategories, barDiscounts, barPrices, barProducts, barRecipeItems } from '~~/server/db/schema/bar'

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
    { id: 'p-ginger', categoryId: 'cat-mixers', name: 'Ginger ale', unit: 'can' as const, price: 120, par: 12, age: false },
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

  // Poured only as measures, so they carry no price and reach no till.
  await db.insert(barProducts).values([
    { id: 'p-gin', categoryId: 'cat-spirits', name: 'Gin, 70 cl bottle', unit: 'bottle', containerMl: 700, stockOnly: true, parQty: 1400 },
    { id: 'p-vodka', categoryId: 'cat-spirits', name: 'Vodka, 1 L bottle', unit: 'bottle', containerMl: 1000, stockOnly: true, parQty: 2000 },
    { id: 'p-kahlua', categoryId: 'cat-spirits', name: 'Coffee liqueur, 70 cl bottle', unit: 'bottle', containerMl: 700, stockOnly: true, parQty: 700 },
    { id: 'p-espresso', categoryId: 'cat-spirits', name: 'Espresso, 1 L flask', unit: 'bottle', containerMl: 1000, stockOnly: true, parQty: 1000, ageRestricted: false },
  ])

  // A serve is a recipe over what is stocked. A choice slot is filled at the
  // till from a category, so one button covers every mixer (docs/13 §3.1).
  const serves = [
    { id: 'p-white-175', categoryId: 'cat-wine', name: 'House white, large glass', unit: 'glass' as const, price: 550,
      recipe: [{ componentProductId: 'p-white-btl', qty: 175 }] },
    { id: 'p-white-125', categoryId: 'cat-wine', name: 'House white, small glass', unit: 'glass' as const, price: 420,
      recipe: [{ componentProductId: 'p-white-btl', qty: 125 }] },
    { id: 'p-gin-single', categoryId: 'cat-spirits', name: 'Gin, single', unit: 'measure' as const, price: 300,
      recipe: [{ componentProductId: 'p-gin', qty: 25 }] },
    { id: 'p-gin-double', categoryId: 'cat-spirits', name: 'Gin, double', unit: 'measure' as const, price: 500,
      recipe: [{ componentProductId: 'p-gin', qty: 50 }] },
    { id: 'p-gin-mixer', categoryId: 'cat-spirits', name: 'Gin and mixer', unit: 'glass' as const, price: 400,
      recipe: [{ componentProductId: 'p-gin', qty: 25 }, { choiceCategoryId: 'cat-mixers', qty: 1 }] },
    { id: 'p-espresso-martini', categoryId: 'cat-spirits', name: 'Espresso martini', unit: 'glass' as const, price: 700,
      recipe: [{ componentProductId: 'p-vodka', qty: 50 }, { componentProductId: 'p-kahlua', qty: 25 }, { componentProductId: 'p-espresso', qty: 25 }] },
  ]

  await db.insert(barProducts).values(serves.map(s => ({
    id: s.id,
    categoryId: s.categoryId,
    name: s.name,
    unit: s.unit,
    ageRestricted: true,
  })))

  await db.insert(barRecipeItems).values(serves.flatMap(s => s.recipe.map((item, sort) => ({
    productId: s.id,
    componentProductId: 'componentProductId' in item ? item.componentProductId : null,
    choiceCategoryId: 'choiceCategoryId' in item ? item.choiceCategoryId : null,
    qty: item.qty,
    sort,
  }))))

  const today = new Date().toISOString().slice(0, 10)
  await db.insert(barPrices).values([
    ...stock.map(p => ({ productId: p.id, pricePence: p.price, effectiveFrom: today })),
    ...serves.map(s => ({ productId: s.id, pricePence: s.price, effectiveFrom: today })),
  ])

  await db.insert(barDiscounts).values([
    { name: 'Committee', percent: 20, sort: 1 },
    { name: 'Cast & crew', percent: 10, sort: 2 },
  ])

  console.log(`   ${categories.length} categories, ${stock.length + serves.length + 4} products, 2 discounts`)
}
