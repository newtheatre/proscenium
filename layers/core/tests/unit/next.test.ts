// The return path from `?next=` (ID-07): sign-in and the access form apply the same rule.
import { describe, expect, it } from 'vitest'
import { safeNext } from '../../shared/next'

describe('safeNext', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeNext('/whats-on/hamlet/book?performance=p1')).toBe('/whats-on/hamlet/book?performance=p1')
    expect(safeNext('/account/access/apply?next=%2Fwhats-on%2Fhamlet')).toBe('/account/access/apply?next=%2Fwhats-on%2Fhamlet')
  })

  it('drops anything that could leave the site', () => {
    for (const next of ['https://evil.example/x', '//evil.example/x', '/%2F%2Fevil.example', '/\\evil.example', 'javascript:alert(1)', 'relative', '', undefined, 42]) {
      expect(safeNext(next), String(next)).toBeNull()
    }
  })
})
