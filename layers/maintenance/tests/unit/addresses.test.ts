import { describe, expect, it } from 'vitest'
import { isApi, isOpenAddress } from '../../shared/addresses'

describe('the addresses maintenance mode leaves open', () => {
  it('keeps signing in, the staff shells and the build\'s files open', () => {
    for (const path of ['/sign-in', '/sign-in/link', '/setup', '/console', '/console/box-office/sell', '/admin/modules/maintenance', '/live/door', '/_nuxt/app.js', '/__nuxt_content/pages/sql_dump', '/files/abc', '/favicon.ico', '/robots.txt'])
      expect(isOpenAddress(path), path).toBe(true)
  })

  it('keeps the core\'s API, this module\'s and every webhook open', () => {
    for (const path of ['/api/core/viewer', '/api/core/sign-in/email', '/api/maintenance/state', '/api/payments/webhooks/stripe'])
      expect(isOpenAddress(path), path).toBe(true)
  })

  it('closes the public pages, My account and other modules\' API', () => {
    for (const path of ['/', '/whats-on', '/shows/hamlet', '/account', '/members', '/book/order/abc', '/api/box-office/baskets', '/api/public-site/productions', '/consoles', '/sign-inside'])
      expect(isOpenAddress(path), path).toBe(false)
  })

  it('opens what a module contributes, and only below it', () => {
    expect(isOpenAddress('/book/order/abc', ['/book/order/'])).toBe(true)
    expect(isOpenAddress('/api/box-office/orders/link', ['/api/box-office/orders/link'])).toBe(true)
    expect(isOpenAddress('/api/box-office/orders/link/cancel', ['/api/box-office/orders/link'])).toBe(true)
    expect(isOpenAddress('/api/box-office/orders/linked', ['/api/box-office/orders/link'])).toBe(false)
  })

  it('knows the API from a page', () => {
    expect(isApi('/api/box-office/baskets')).toBe(true)
    expect(isApi('/apiary')).toBe(false)
  })
})
