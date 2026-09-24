import { describe, expect, test } from 'bun:test'
import { choiceWithStock, productBlocked, productOutOfStock, saleJustCompleted, sizeBlocked, sizeOutOfStock, variantStock } from '#shared/utils/sale'
import type { SaleChoice, SaleProduct, SaleVariant } from '#shared/utils/sale'

// F-128 criterion 8: what the grid and the size sheet read off each size's servings, and when that
// stops the button rather than only labelling it (0080).

function aVariant(id: string, stock: SaleVariant['stock']): SaleVariant {
  return { id, servingKind: 'pint', label: id, pricePence: 500, priceSource: 'variant', choice: null, stock }
}

function aProduct(variants: SaleVariant[]): SaleProduct {
  return { id: 'p', name: 'Lager', categoryId: 'c', ageRestricted: false, allergenState: 'NONE', allergenNote: null, variants }
}

describe('a size\'s stock as the till reads it', () => {
  test('none left once the stock is counted is out, and stops the button', () => {
    const stock = variantStock(0, true)
    expect(stock).toEqual({ servingsLeft: 0, blocks: true })
    expect(sizeOutOfStock(aVariant('v', stock))).toBe(true)
    expect(sizeBlocked(aVariant('v', stock))).toBe(true)
  })

  test('before the cutover count, none left is only a label', () => {
    const stock = variantStock(0, false)
    expect(sizeOutOfStock(aVariant('v', stock))).toBe(true)
    expect(sizeBlocked(aVariant('v', stock))).toBe(false)
  })

  test('some left is neither', () => {
    const stock = variantStock(3, true)
    expect(sizeOutOfStock(aVariant('v', stock))).toBe(false)
    expect(sizeBlocked(aVariant('v', stock))).toBe(false)
  })

  test('a size that depletes nothing has no stock to run out of', () => {
    expect(variantStock(null, true)).toBe(null)
    expect(sizeOutOfStock(aVariant('v', null))).toBe(false)
  })

  // A phone may still hold a catalogue cached before sizes carried stock at all.
  test('a size cached with no stock field reads as in stock', () => {
    const cached = { ...aVariant('v', null), stock: undefined } as unknown as SaleVariant
    expect(sizeOutOfStock(cached)).toBe(false)
    expect(sizeBlocked(cached)).toBe(false)
  })
})

describe('a product tile reads out only when every size is', () => {
  test('one size left keeps the tile live and unlabelled', () => {
    const product = aProduct([aVariant('half', variantStock(0, true)), aVariant('pint', variantStock(2, true))])
    expect(productOutOfStock(product)).toBe(false)
    expect(productBlocked(product)).toBe(false)
  })

  test('every size out labels the tile, and stops it once the stock is counted', () => {
    expect(productBlocked(aProduct([aVariant('half', variantStock(0, true)), aVariant('pint', variantStock(0, true))]))).toBe(true)
    const uncounted = aProduct([aVariant('half', variantStock(0, false)), aVariant('pint', variantStock(0, false))])
    expect(productOutOfStock(uncounted)).toBe(true)
    expect(productBlocked(uncounted)).toBe(false)
  })
})

// F-128 criterion 9: an option of a size's choice carries its own servings, read as a size's are.
describe('an option in the choice step reads its own stock', () => {
  const mixers: SaleChoice = { id: 'g', name: 'Mixer', options: [{ id: 'tonic', itemName: 'Tonic' }, { id: 'soda', itemName: 'Soda' }] }

  test('an empty option is out, and stops its button once the stock is counted', () => {
    const choice = choiceWithStock(mixers, new Map([['tonic', 0], ['soda', 4]]), true)!
    const [tonic, soda] = choice.options
    expect(tonic!.stock).toEqual({ servingsLeft: 0, blocks: true })
    expect(sizeOutOfStock(tonic!)).toBe(true)
    expect(sizeBlocked(tonic!)).toBe(true)
    expect(sizeOutOfStock(soda!)).toBe(false)
    expect(sizeBlocked(soda!)).toBe(false)
  })

  test('before the cutover count an empty option is only labelled', () => {
    const [tonic] = choiceWithStock(mixers, new Map([['tonic', 0]]), false)!.options
    expect(sizeOutOfStock(tonic!)).toBe(true)
    expect(sizeBlocked(tonic!)).toBe(false)
  })

  test('an option the read did not answer for reads as in stock', () => {
    const [tonic] = choiceWithStock(mixers, undefined, true)!.options
    expect(tonic!.stock).toBe(null)
    expect(sizeOutOfStock(tonic!)).toBe(false)
  })

  test('a size with no choice stays without one', () => {
    expect(choiceWithStock(null, new Map(), true)).toBe(null)
  })

  // A phone may still hold a catalogue cached before options carried stock.
  test('an option cached with no stock field reads as in stock', () => {
    expect(sizeOutOfStock(mixers.options[0]!)).toBe(false)
    expect(sizeBlocked(mixers.options[0]!)).toBe(false)
  })
})

// F-128 criterion 9: the till reads the catalogue again when a receipt appears, on any path.
describe('a completed sale is what refreshes the till\'s stock', () => {
  const receipt = { totalPence: 500 }

  test('a receipt appearing where there was none is a completed sale', () => {
    expect(saleJustCompleted([receipt, null], [null, null])).toBe(true)
    expect(saleJustCompleted([null, receipt], [null, null])).toBe(true)
  })

  test('the next sale clearing a receipt is not one', () => {
    expect(saleJustCompleted([null, null], [receipt, null])).toBe(false)
  })

  test('a receipt already on screen is not counted twice', () => {
    expect(saleJustCompleted([receipt, null], [receipt, null])).toBe(false)
  })

  test('nothing having happened is not one', () => {
    expect(saleJustCompleted([null, null], [null, null])).toBe(false)
  })
})
