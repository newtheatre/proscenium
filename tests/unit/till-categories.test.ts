import { describe, expect, test } from 'bun:test'
import { categoriesShown } from '#shared/utils/sale'

// F-103 criterion 6: the category row filters the grid. What a chosen chip leaves on screen is
// pure, so it is proved here; the presses themselves are in `tests/e2e/till.test.ts`.

const categories = [{ id: 'beer', name: 'Beer' }, { id: 'wine', name: 'Wine' }, { id: 'soft', name: 'Soft' }]

describe('the category row filters the grid (F-103 criterion 6)', () => {
  test('All shows every category', () => {
    expect(categoriesShown(categories, null)).toEqual(categories)
  })

  test('a chosen category shows its tiles alone', () => {
    expect(categoriesShown(categories, 'wine')).toEqual([categories[1]])
  })

  test('a chosen category that emptied falls back to All, never to a blank grid', () => {
    expect(categoriesShown(categories, 'spirits')).toEqual(categories)
  })
})
