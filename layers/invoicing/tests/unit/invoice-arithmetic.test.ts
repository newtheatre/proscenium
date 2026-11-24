// An invoice's arithmetic (rules I-05 and I-42): the screen and the server share it, so both round the
// same way, half up to the penny, and a number reads the same on both.
import { describe, expect, it } from 'vitest'
import { formatNumber, lineNet, lineTax } from '../../shared/invoices'

describe('invoice arithmetic', () => {
  it('works a line\'s net from thousandths of a quantity, half up', () => {
    expect(lineNet(2000, 4500)).toBe(9000)
    expect(lineNet(1500, 333)).toBe(500)
    expect(lineNet(1, 499)).toBe(0)
    expect(lineNet(1, 500)).toBe(1)
  })

  it('works VAT from basis points, half up, and none at a nought rate', () => {
    expect(lineTax(1999, 2000)).toBe(400)
    expect(lineTax(1997, 2000)).toBe(399)
    expect(lineTax(1000, 500)).toBe(50)
    expect(lineTax(750, 0)).toBe(0)
  })

  it('pads a number to the series\' digits', () => {
    expect(formatNumber('INV-', 4, 42)).toBe('INV-0042')
    expect(formatNumber('', 3, 12345)).toBe('12345')
  })
})
