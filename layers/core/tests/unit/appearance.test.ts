// The rule for which colour mode a request is served in (shared/appearance.ts), and the cache a
// page's server render shares between the routes it calls (kit/route.ts).
import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { modeToApply } from '../../shared/appearance'
import { requestCache } from '../../kit/route'

describe('the mode a request is served in', () => {
  it('gives a first-time visitor the site owner\'s starting mode', () => {
    expect(modeToApply({ start: 'dark', mayChoose: true, stored: undefined, chosen: false })).toBe('dark')
  })

  it('replaces a mode the browser stored by itself, which says nothing about who chose it', () => {
    expect(modeToApply({ start: 'dark', mayChoose: true, stored: 'system', chosen: false })).toBe('dark')
  })

  it('leaves the cookie alone when it already holds the starting mode', () => {
    expect(modeToApply({ start: 'dark', mayChoose: true, stored: 'dark', chosen: false })).toBeUndefined()
  })

  it('keeps a person\'s own choice', () => {
    expect(modeToApply({ start: 'dark', mayChoose: true, stored: 'light', chosen: true })).toBeUndefined()
  })

  it('gives everyone the starting mode once the choice is turned off', () => {
    expect(modeToApply({ start: 'dark', mayChoose: false, stored: 'light', chosen: true })).toBe('dark')
  })

  it('does nothing for a starting mode it does not know', () => {
    expect(modeToApply({ start: 'sepia', mayChoose: true, stored: undefined, chosen: false })).toBeUndefined()
  })
})

describe('the cache shared by one page render', () => {
  const event = (context: object) => ({ context }) as unknown as H3Event

  it('is one cache for every call that carries the same platform object', () => {
    const platform = {}
    const first = requestCache(event({ _platform: platform }))
    first.settings = Promise.resolve(new Map())
    expect(requestCache(event({ _platform: platform, other: true }))).toBe(first)
  })

  it('is a different cache for another outside request', () => {
    expect(requestCache(event({ _platform: {} }))).not.toBe(requestCache(event({ _platform: {} })))
  })

  it('is a fresh cache each time where there is no platform object, as under nuxt dev', () => {
    expect(requestCache(event({}))).not.toBe(requestCache(event({})))
  })
})
