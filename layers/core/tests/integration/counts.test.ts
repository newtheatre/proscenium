// A count that does not answer reads as zero once its time is up, so a home page or menu that shows
// it is never held up by it (UI-04, UI-16).
import { describe, expect, it } from 'vitest'
import { countOf, shows, within } from '../../server/interface/counts'
import { inContext, person } from '../../../../tests/integration/helpers'

describe('counts that do not answer', () => {
  it('within gives the value when it comes in time, and the fallback when it does not', async () => {
    expect(await within(Promise.resolve(4), 50, 0)).toBe(4)
    expect(await within(new Promise<number>(() => {}), 20, 0)).toBe(0)
  })

  it('reads a count that never answers as zero, and leaves out what it would have shown', async () => {
    const actor = person(['gallery.sample.slow'])
    const started = Date.now()
    expect(await inContext(() => countOf('gallery.stalled', actor, 50), actor)).toBe(0)
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(await inContext(() => countOf('gallery.drafts', actor, 50), actor)).toBe(3)
  })

  it('leaves out a card whose count never answers, in a few seconds', async () => {
    const actor = person(['gallery.sample.slow'])
    expect(await inContext(() => shows({ count: 'gallery.stalled', hideEmpty: true }, actor), actor)).toEqual({ show: false, value: 0 })
  }, 10_000)
})
