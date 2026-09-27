import { describe, expect, test } from 'bun:test'
import { DEFAULT_LOG_KIND, LOG_KINDS, logRoute } from '#shared/utils/incidents'
import { nightHintShows } from '#shared/utils/night-shell'

// Issue 1317: the show-night screens stop borrowing the desk's habits. An overlay is a sheet from
// the foot of the phone, a hint is for an empty or first-use screen, houses stack, and an incident
// is one Log something sheet.

const read = (path: string): Promise<string> => Bun.file(path).text()

const SHEET = 'app/components/NightSheet.vue'
const CHOICES = 'app/components/NightChoices.vue'

// Every overlay the show-night screens own; the till's sit with the bar and follow on their own.
const NIGHT_OVERLAYS = [
  'app/pages/tonight/incidents/index.vue',
  'app/pages/tonight/age-checks/index.vue',
  'app/pages/tonight/board.vue',
  'app/components/BoardCallChange.vue',
  'app/components/NightChecklistItems.vue',
  'app/components/NightCompQueue.vue',
]

describe('a night overlay is a sheet, not the desk modal (issue 1317, K-102)', () => {
  test('the sheet is a drawer from the foot, titled and nothing more', async () => {
    const source = await read(SHEET)
    expect(source).toContain('<UDrawer')
    expect(source).not.toContain('description')
  })

  test('its primary is full width with Back beneath it', async () => {
    const source = await read(SHEET)
    expect(source).toMatch(/<UButton[^>]*\bblock\b[\s\S]*\{\{ primary \}\}[\s\S]*CONFIRM_BACK_LABEL/)
  })

  test('it opens with the focus on the first choice, never the corner cross', async () => {
    expect(await read(SHEET)).toContain('[data-sheet-first]')
    expect(await read(CHOICES)).toContain('data-sheet-first')
  })

  test('a choice is a 48 pixel tile', async () => {
    expect(await read(CHOICES)).toContain('min-h-12')
  })

  test('no show-night screen still opens the desk modal', async () => {
    const offenders: string[] = []
    for (const path of NIGHT_OVERLAYS) {
      const source = await read(path)
      if (source.includes('<UModal')) offenders.push(path)
      if (!source.includes('<NightSheet')) offenders.push(`${path} (no sheet)`)
    }
    expect(offenders).toEqual([])
  })
})

describe('a hint is for an empty or first-use screen (issue 1317, K-101)', () => {
  test('shown the first time, or while there is nothing on the screen yet', () => {
    expect(nightHintShows({ empty: false, seenBefore: false })).toBe(true)
    expect(nightHintShows({ empty: true, seenBefore: true })).toBe(true)
    expect(nightHintShows({ empty: false, seenBefore: true })).toBe(false)
  })

  test('the screen frame reads it, and the incident log keeps no standing sentence', async () => {
    expect(await read('app/components/NightScreen.vue')).toContain('nightHintShows(')
    expect(await read('app/pages/tonight/incidents/index.vue')).not.toContain('Every entry is timed and named, and lands')
  })
})

describe('tonight\'s houses stack, never scroll sideways (issue 1317, E-127)', () => {
  test('the switcher is rows, one under the other', async () => {
    const source = await read('app/components/NightPerformanceSwitcher.vue')
    expect(source).not.toContain('overflow-x-auto')
    expect(source).toContain('flex-col')
  })

  test('the glance uses the same switcher', async () => {
    const source = await read('app/pages/tonight/glance.vue')
    expect(source).toContain('<NightPerformanceSwitcher')
    expect(source).not.toContain('overflow-x-auto')
  })
})

describe('one Log something sheet (issue 1317, E-115, E-117 criterion 1 as trimmed)', () => {
  test('a near miss is a kind, chosen already, and the other kinds follow it', () => {
    expect(DEFAULT_LOG_KIND).toBe('NEAR_MISS')
    expect(LOG_KINDS).toEqual(['NEAR_MISS', 'NOTE', 'INCIDENT', 'SERIOUS'])
  })

  test('a near miss files through its own route, anything else through the log', () => {
    expect(logRoute('NEAR_MISS')).toBe('/api/tonight/incidents/near-miss')
    expect(logRoute('INCIDENT')).toBe('/api/tonight/incidents')
    expect(logRoute('SERIOUS')).toBe('/api/tonight/incidents')
  })

  test('the log pins one Log something, with kind and category as chips', async () => {
    const source = await read('app/pages/tonight/incidents/index.vue')
    expect(source).toContain('label="Log something"')
    expect(source).not.toContain('label="Report a near miss"')
    expect(source).not.toContain('<USelect')
    expect(source).toContain('test-id="log-kind"')
    expect(source).toContain('test-id="log-category"')
  })
})
