import { describe, expect, test } from 'bun:test'
import { archiveShowCategoryForm, showCategoryForm } from '#shared/utils/show-categories'

// D-131's show category form: a name and the order it is presented in (criterion 3).

describe('a category needs a name', () => {
  test('a name is required, and blank is not one', () => {
    expect(showCategoryForm.safeParse({ name: 'Drama' }).success).toBe(true)
    expect(showCategoryForm.safeParse({ name: '  ' }).success).toBe(false)
  })

  test('sort defaults to nought', () => {
    expect(showCategoryForm.parse({ name: 'Drama' }).sort).toBe(0)
  })
})

describe('retiring is its own action', () => {
  test('the archive form takes a plain boolean', () => {
    expect(archiveShowCategoryForm.parse({ archived: true })).toEqual({ archived: true })
    expect(archiveShowCategoryForm.safeParse({}).success).toBe(false)
  })
})
