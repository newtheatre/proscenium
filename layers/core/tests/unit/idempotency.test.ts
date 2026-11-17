// Every write from the browser carries an Idempotency-Key, so a route that requires one works from
// any screen: one is made when the screen gave none, a screen's own is kept, and reads get none.
import { describe, expect, it } from 'vitest'
import { withIdempotencyKey } from '../../app/utils/idempotency'

const key = (options: unknown) => new Headers((options as { headers?: HeadersInit })?.headers).get('idempotency-key')

describe('withIdempotencyKey', () => {
  it('adds a key to a write that has none, whatever shape its headers take', () => {
    expect(key(withIdempotencyKey({ method: 'POST', body: {} }, () => 'made'))).toBe('made')
    expect(key(withIdempotencyKey({ method: 'put', headers: { 'x-basket-token': 't' } }, () => 'made'))).toBe('made')
    expect(key(withIdempotencyKey({ method: 'DELETE', headers: [['x-a', 'b']] }, () => 'made'))).toBe('made')
    const kept = withIdempotencyKey({ method: 'PATCH', headers: new Headers({ 'x-order-token': 'o' }) }, () => 'made')
    expect(new Headers((kept as { headers: HeadersInit }).headers).get('x-order-token')).toBe('o')
  })

  it('keeps a key the screen chose', () => {
    expect(key(withIdempotencyKey({ method: 'POST', headers: { 'Idempotency-Key': 'mine' } }, () => 'made'))).toBe('mine')
  })

  it('leaves reads alone', () => {
    expect(key(withIdempotencyKey(undefined, () => 'made'))).toBeNull()
    expect(key(withIdempotencyKey({ method: 'GET' }, () => 'made'))).toBeNull()
  })
})
