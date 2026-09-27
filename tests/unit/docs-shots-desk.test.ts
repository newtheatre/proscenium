import { describe, expect, test } from 'bun:test'
import { DESK_FINDS_A_NIGHT, boxOffice } from '../../scripts/docs-shots/box-office'

// The desk picture never depends on which show night the seed ran on: a seed that leaves tonight
// with no performance is stepped on to the next night that has one, as an officer would.

// A desk that shows a performance once `showsFrom` nights have been stepped through, with the
// page's own timers run at once.
function desk(showsFrom: number): { clicks: () => number, run: () => void } {
  let clicks = 0
  const document = {
    querySelector: (selector: string) => {
      if (selector.includes('desk-performance')) return clicks >= showsFrom ? {} : null
      if (selector.includes('desk-next-night')) {
        return {
          click: () => {
            clicks += 1
          },
        }
      }
      return null
    },
  }
  const setTimeout = (next: () => void) => next()
  const run = new Function('document', 'setTimeout', DESK_FINDS_A_NIGHT) as (d: unknown, t: unknown) => void
  return { clicks: () => clicks, run: () => run(document, setTimeout) }
}

describe('the desk picture finds a night with a show', () => {
  test('a night that has one is pictured as it is', () => {
    const shown = desk(0)
    shown.run()
    expect(shown.clicks()).toBe(0)
  })

  test('a seed that left tonight empty steps on to the next night with a performance', () => {
    const shown = desk(3)
    shown.run()
    expect(shown.clicks()).toBe(3)
  })

  test('it gives up after a fortnight rather than stepping for ever', () => {
    const shown = desk(Number.POSITIVE_INFINITY)
    shown.run()
    expect(shown.clicks()).toBe(14)
  })

  test('the shot runs it, and waits for the summary before the picture', () => {
    const shot = boxOffice.find(one => one.name === 'box-office/desk')!
    expect(shot.after).toBe(DESK_FINDS_A_NIGHT)
    expect(shot.ready).toContain('desk-summary')
  })
})
