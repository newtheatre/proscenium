import { describe, expect, test } from 'bun:test'
import {
  MAX_PASS_PRICE_PENCE,
  newPassTypeForm,
  passTypeForm,
  passTypeShowsForm,
  saysPassTypeStatus,
} from '#shared/utils/pass-types'

// D-123's vocabulary: a pass product's window, its price points and the shows it covers.

const base = {
  name: 'Season pass',
  slug: 'season-pass',
  validFrom: 1_800_000_000,
  validUntil: 1_810_000_000,
  prices: [{ label: 'Standard', price: 4500 }],
  showIds: ['show-1'],
}

describe('a pass has a validity window, price points and covered shows (criterion 1)', () => {
  test('a well formed pass is accepted', () => {
    expect(newPassTypeForm.safeParse(base).success).toBe(true)
  })

  test('a pass cannot expire before it starts', () => {
    expect(newPassTypeForm.safeParse({ ...base, validFrom: base.validUntil, validUntil: base.validFrom }).success)
      .toBe(false)
  })

  test('sales cannot close before they open', () => {
    expect(newPassTypeForm.safeParse({ ...base, salesOpenAt: 2_000, salesCloseAt: 1_000 }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, salesOpenAt: 1_000, salesCloseAt: 2_000 }).success).toBe(true)
  })

  test('a pass needs at least one price point, and each needs its own label', () => {
    expect(newPassTypeForm.safeParse({ ...base, prices: [] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({
      ...base,
      prices: [{ label: 'Standard', price: 1000 }, { label: 'standard', price: 500 }],
    }).success).toBe(false)
  })

  test('a price in pence is taken, a fractional or absurd one is not', () => {
    expect(newPassTypeForm.safeParse({ ...base, prices: [{ label: 'Half', price: 7.5 }] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, prices: [{ label: 'Wrong', price: MAX_PASS_PRICE_PENCE + 1 }] }).success)
      .toBe(false)
  })

  test('a pass needs to cover at least one show, and a show is covered once', () => {
    expect(newPassTypeForm.safeParse({ ...base, showIds: [] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, showIds: ['show-1', 'show-1'] }).success).toBe(false)
  })
})

describe('the cap is an explicit number, uncapped otherwise (criterion 2)', () => {
  test('no cap is fine, a positive one is taken, nought or negative is not', () => {
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: null }).success).toBe(true)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: 200 }).success).toBe(true)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: 0 }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: -1 }).success).toBe(false)
  })
})

describe('covered shows move through their own form (criterion 4)', () => {
  test('the edit form takes a status but no shows', () => {
    const { showIds: _showIds, ...withoutShows } = base
    const edited = passTypeForm.parse({ ...withoutShows, status: 'ON_SALE' })
    expect('showIds' in edited).toBe(false)
    expect(edited.status).toBe('ON_SALE')
  })

  test('an unrecognised status is refused', () => {
    expect(passTypeForm.safeParse({ ...base, status: 'ARCHIVED' }).success).toBe(false)
  })

  test('the shows form takes the full covered set, deduplicated and non-empty', () => {
    expect(passTypeShowsForm.safeParse({ showIds: [] }).success).toBe(false)
    expect(passTypeShowsForm.parse({ showIds: ['show-1', 'show-2'] }).showIds).toEqual(['show-1', 'show-2'])
  })
})

describe('what a screen says', () => {
  test('a status reads as English', () => {
    expect(saysPassTypeStatus('DRAFT')).toBe('Draft')
    expect(saysPassTypeStatus('ON_SALE')).toBe('On sale')
    expect(saysPassTypeStatus('CLOSED')).toBe('Closed')
  })
})
