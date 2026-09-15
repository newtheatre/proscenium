import { describe, expect, test } from 'bun:test'
import {
  MEASURE_PRESETS,
  SERVING_KINDS,
  measurePreset,
  presetForCategory,
  productSetupForm,
  productShape,
} from '#shared/utils/bar'

// F-127's set-up vocabulary: shape read from the variants a product holds, presets over the
// serving kinds the vocabulary already has, and one payload per shape (0017, amended 15 September).

type ShapeVariant = Parameters<typeof productShape>[0][number]

const aVariant = (over: Partial<ShapeVariant> = {}): ShapeVariant => ({
  status: 'ACTIVE',
  components: [],
  ...over,
} as ShapeVariant)

const pours = (itemId: string, qty = 1) => ({ itemId, choiceGroupId: null, qty })
const chooses = (choiceGroupId: string) => ({ itemId: null, choiceGroupId, qty: 1 })

const aProduct = { name: 'House red', categoryId: 'cat-wine' }

const aSimple = (over: Record<string, unknown> = {}) => productSetupForm.safeParse({
  shape: 'SIMPLE',
  product: { name: 'Cider can', categoryId: 'cat-cans' },
  item: { mode: 'NEW', item: { name: 'Cider 440ml can', unit: 'ITEM' } },
  serving: { servingKind: 'can', label: 'Can', qty: 1, pricePence: 250 },
  ...over,
})

const aMeasured = (over: Record<string, unknown> = {}) => productSetupForm.safeParse({
  shape: 'MEASURED',
  product: aProduct,
  item: { mode: 'NEW', item: { name: 'House red 750ml', unit: 'ML', containerMl: 750 } },
  sizes: [
    { servingKind: 'bottle', label: 'Bottle', qty: 750, pricePence: 1400 },
    { servingKind: '175ml', label: '175ml', qty: 175, pricePence: 400 },
  ],
  ...over,
})

const aRecipe = (over: Record<string, unknown> = {}) => productSetupForm.safeParse({
  shape: 'RECIPE',
  product: { name: 'Negroni', categoryId: 'cat-cocktails' },
  serving: { servingKind: 'item', label: 'Each', pricePence: 600 },
  components: [
    { itemId: 'item-gin', qty: 25 },
    { itemId: 'item-campari', qty: 25 },
    { itemId: 'item-vermouth', qty: 25 },
  ],
  ...over,
})

describe('a product shape is read from its variants, never stored (F-127 criterion 1)', () => {
  test('a product with no live variants has no shape yet', () => {
    expect(productShape([])).toBe('UNSET')
    expect(productShape([aVariant({ status: 'RETIRED', components: [pours('item-cider')] })])).toBe('UNSET')
  })

  test('a can is one serving of one item: sold as itself', () => {
    expect(productShape([aVariant({ components: [pours('item-cider')] })])).toBe('SIMPLE')
  })

  test('a wine is several servings off one item: sold by measure', () => {
    const wine = [
      aVariant({ components: [pours('item-red', 750)] }),
      aVariant({ components: [pours('item-red', 175)] }),
      aVariant({ components: [pours('item-red', 125)] }),
    ]
    expect(productShape(wine)).toBe('MEASURED')
  })

  // A mixer is a choice, not a second ingredient: attaching one to a double must not turn the
  // spirit into a recipe, or the shape a product was created under would change under it.
  test('a spirit with a mixer choice is still sold by measure', () => {
    const spirit = [
      aVariant({ components: [pours('item-gin', 25), chooses('group-mixers')] }),
      aVariant({ components: [pours('item-gin', 50), chooses('group-mixers')] }),
    ]
    expect(productShape(spirit)).toBe('MEASURED')
  })

  test('a cocktail depletes several items: made from several things', () => {
    const cocktail = [aVariant({
      components: [pours('item-gin', 25), pours('item-campari', 25), pours('item-vermouth', 25)],
    })]
    expect(productShape(cocktail)).toBe('RECIPE')
  })

  test('several sizes over several items is still a recipe', () => {
    const jug = [
      aVariant({ components: [pours('item-gin', 25), pours('item-tonic', 1)] }),
      aVariant({ components: [pours('item-gin', 50), pours('item-tonic', 2)] }),
    ]
    expect(productShape(jug)).toBe('RECIPE')
  })

  test('retired sizes do not decide the shape of what is still sold', () => {
    const wine = [
      aVariant({ components: [pours('item-red', 750)] }),
      aVariant({ status: 'RETIRED', components: [pours('item-red', 250)] }),
    ]
    expect(productShape(wine)).toBe('SIMPLE')
  })
})

describe('measure presets sit over the serving kinds that already exist (F-127 criterion 2)', () => {
  test('a preset may not invent a serving kind', () => {
    const invented = MEASURE_PRESETS.flatMap(preset => preset.sizes
      .filter(size => !(SERVING_KINDS as readonly string[]).includes(size.servingKind))
      .map(size => `${preset.id}: ${size.servingKind}`))
    expect(invented).toEqual([])
  })

  test('the four presets the bar pours by are there, at the quantities it pours', () => {
    expect(MEASURE_PRESETS.map(preset => preset.id)).toEqual(['WINE', 'SPIRITS', 'DRAUGHT', 'PACKAGED'])
    expect(measurePreset('WINE')?.sizes.map(size => size.qty)).toEqual([750, 250, 175, 125])
    expect(measurePreset('SPIRITS')?.sizes.map(size => size.qty)).toEqual([25, 50])
    expect(measurePreset('DRAUGHT')?.sizes.map(size => size.qty)).toEqual([568, 284])
    expect(measurePreset('PACKAGED')?.sizes.map(size => size.qty)).toEqual([1])
  })

  test('a preset says what it is measured in, and only a measured one suggests a container', () => {
    expect(measurePreset('WINE')?.unit).toBe('ML')
    expect(measurePreset('WINE')?.containerMl).toBe(750)
    expect(measurePreset('PACKAGED')?.unit).toBe('ITEM')
    expect(measurePreset('PACKAGED')?.containerMl).toBe(null)
    // Kegs and casks come in several sizes, so a draught container is asked for rather than guessed.
    expect(measurePreset('DRAUGHT')?.containerMl).toBe(null)
  })

  test('every preset size resolves a serving kind a category default can be set for', () => {
    for (const preset of MEASURE_PRESETS) {
      const kinds = preset.sizes.map(size => size.servingKind)
      expect(`${preset.id}: ${new Set(kinds).size === kinds.length}`).toBe(`${preset.id}: true`)
    }
  })

  test('a category name preselects the preset the bar would have picked', () => {
    expect(presetForCategory('Wine')).toBe('WINE')
    expect(presetForCategory('House red wine')).toBe('WINE')
    expect(presetForCategory('Spirits')).toBe('SPIRITS')
    expect(presetForCategory('Draught beer')).toBe('DRAUGHT')
    expect(presetForCategory('Cans and bottles')).toBe('PACKAGED')
  })

  test('a category nothing matches preselects nothing rather than guessing', () => {
    expect(presetForCategory('Snacks')).toBe(null)
    expect(presetForCategory('')).toBe(null)
  })
})

describe('one payload per shape, validated before anything is written (F-127 criterion 4)', () => {
  test('each shape parses as the thing the wizard submits', () => {
    expect(aSimple().success).toBe(true)
    expect(aMeasured().success).toBe(true)
    expect(aRecipe().success).toBe(true)
  })

  test('a shape nobody offers is refused', () => {
    expect(productSetupForm.safeParse({ shape: 'MIXED', product: aProduct }).success).toBe(false)
    expect(productSetupForm.safeParse({ shape: 'UNSET', product: aProduct }).success).toBe(false)
  })

  test('the product half keeps every rule the product form already carries', () => {
    expect(aSimple({ product: { name: 'Cider', categoryId: '' } }).success).toBe(false)
    expect(aSimple({ product: { name: 'Cider', categoryId: 'cat-cans', allergenState: 'RECORDED' } }).success).toBe(false)
  })

  test('a new stocked item keeps the rules the stock form carries', () => {
    expect(aSimple({ item: { mode: 'NEW', item: { name: 'Cider', unit: 'ITEM', containerMl: 440 } } }).success).toBe(false)
    expect(aSimple({ item: { mode: 'EXISTING', itemId: 'item-cider' } }).success).toBe(true)
    expect(aSimple({ item: { mode: 'EXISTING', itemId: '' } }).success).toBe(false)
  })

  test('a size with no price of its own is allowed through, to be priced or hidden after', () => {
    expect(aMeasured({
      sizes: [{ servingKind: 'bottle', label: 'Bottle', qty: 750, pricePence: null }],
    }).success).toBe(true)
  })

  test('pounds typed into a pence field are caught before the batch', () => {
    expect(aSimple({ serving: { servingKind: 'can', label: 'Can', qty: 1, pricePence: 250_000 } }).success).toBe(false)
  })

  test('a measure with no sizes ticked is refused', () => {
    expect(aMeasured({ sizes: [] }).success).toBe(false)
  })

  test('one serving kind cannot be set up twice on one product', () => {
    expect(aMeasured({
      sizes: [
        { servingKind: '175ml', label: '175ml', qty: 175, pricePence: 400 },
        { servingKind: '175ml', label: 'Large glass', qty: 175, pricePence: 450 },
      ],
    }).success).toBe(false)
  })

  test('a serving that depletes nothing is refused', () => {
    expect(aMeasured({
      sizes: [{ servingKind: 'bottle', label: 'Bottle', qty: 0, pricePence: 1400 }],
    }).success).toBe(false)
  })

  test('an empty recipe and a repeated ingredient are both refused', () => {
    expect(aRecipe({ components: [] }).success).toBe(false)
    expect(aRecipe({
      components: [{ itemId: 'item-gin', qty: 25 }, { itemId: 'item-gin', qty: 25 }],
    }).success).toBe(false)
  })

  test('a recipe may create its choice group in the same submission', () => {
    const parsed = aRecipe({
      choice: {
        group: { name: 'Mixer', options: [{ itemId: 'item-tonic', qty: 1 }, { itemId: 'item-soda', qty: 1 }] },
        includedInPrice: true,
      },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.shape === 'RECIPE' && parsed.data.choice?.qty).toBe(1)
  })

  test('a choice group with no options is refused', () => {
    expect(aRecipe({ choice: { group: { name: 'Mixer', options: [] } } }).success).toBe(false)
  })

  test('an opening delivery is optional, positive and costed in pence', () => {
    expect(aSimple({ opening: { qty: 24, unitCostPence: 95 } }).success).toBe(true)
    expect(aSimple({ opening: null }).success).toBe(true)
    expect(aSimple({ opening: { qty: 0 } }).success).toBe(false)
    expect(aSimple({ opening: { qty: -24 } }).success).toBe(false)
  })
})
