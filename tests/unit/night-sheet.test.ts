import { describe, expect, test } from 'bun:test'
import { DEFAULT_LOG_KIND, LOG_KINDS, logRoute } from '#shared/utils/incidents'
import { nightHintShows } from '#shared/utils/night-shell'

// Issue 1317: an overlay is a sheet from the foot of the phone, a hint is for an empty or first-use
// screen, houses stack, and an incident is one Log something sheet (docs/design-language.md 11).

const read = (path: string): Promise<string> => Bun.file(path).text()

const SHEET = 'app/components/NightSheet.vue'
const CHOICES = 'app/components/NightChoices.vue'

// Every screen and component the show-night kit owns. The till's dialogues live in
// app/components/till, the bar's to move, and stay outside the glob.
function showNightFiles(): string[] {
  return [
    ...new Bun.Glob('pages/tonight/**/*.vue').scanSync({ cwd: 'app' }),
    ...new Bun.Glob('components/{Night,Board}*.vue').scanSync({ cwd: 'app' }),
  ].map(file => `app/${file.replaceAll('\\', '/')}`).sort()
}

// Any way of opening the desk's own overlay, not only its literal tag.
const DESK_OVERLAY = /<(UModal|u-modal|ConfirmModal|USlideover)\b|useOverlay\(/

// The overlays this pull request moved to the sheet, each of which must now draw one.
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

  // A sheet with nothing to choose must not open on its own primary, or Enter resets the board.
  test('with no choice it falls back to a field in the body, then Back, never the footer primary', async () => {
    const source = await read(SHEET)
    expect(source).toContain('[data-slot="body"] :is(input, textarea, select, button)')
    expect(source).toContain('[data-sheet-back]')
    expect(source).toMatch(/<UButton[^>]*data-sheet-back[^>]*>\s*\{\{ CONFIRM_BACK_LABEL \}\}/)
    expect(source).not.toContain('querySelector<HTMLElement>(\'input, textarea, select, button\')')
  })

  test('a choice is a 48 pixel tile', async () => {
    expect(await read(CHOICES)).toContain('min-h-12')
  })

  test('no show-night screen or component opens the desk\'s overlay, by any name', async () => {
    const files = showNightFiles()
    expect(files).toContain('app/pages/tonight/door/index.vue')
    expect(files).toContain('app/components/BoardCallChange.vue')
    const offenders: string[] = []
    for (const path of files) {
      if (DESK_OVERLAY.test(await read(path))) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })

  test('each overlay moved here draws the sheet', async () => {
    const missing: string[] = []
    for (const path of NIGHT_OVERLAYS) {
      if (!(await read(path)).includes('<NightSheet')) missing.push(path)
    }
    expect(missing).toEqual([])
  })

  test('the pattern catches the other spellings of the desk overlay', () => {
    for (const spelled of ['<UModal', '<u-modal', '<ConfirmModal', '<USlideover', 'useOverlay(']) expect(DESK_OVERLAY.test(spelled)).toBe(true)
    expect(DESK_OVERLAY.test('<TillCloseModal')).toBe(false)
  })

  test('no sheet asks for a choice through a dropdown', async () => {
    for (const path of ['app/pages/tonight/incidents/index.vue', 'app/pages/tonight/age-checks/index.vue']) {
      expect(`${path}: ${(await read(path)).includes('<USelect')}`).toBe(`${path}: false`)
    }
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

  // Empty means loaded and empty: before the first load a screen is not empty, only unread.
  test('a screen is empty only once its first load has come back with nothing', async () => {
    for (const path of ['app/pages/tonight/incidents/index.vue', 'app/pages/tonight/age-checks/index.vue', 'app/pages/tonight/checklist/index.vue']) {
      expect(`${path}: ${(await read(path)).includes(':empty="!busy && items.length === 0"')}`).toBe(`${path}: true`)
    }
  })

  // A refused viewer, or a screen that never loaded, has not seen the hint and must see it later.
  test('the hint is remembered only once it has been drawn on a synced, unrefused screen', async () => {
    const screen = await read('app/components/NightScreen.vue')
    expect(screen).not.toContain('localStorage')
    expect(screen).toContain('firstUseOnDevice(')
    expect(screen).toMatch(/watch\(\(\) => showsHint\.value && !props\.refused && props\.stale != null/)
    const cache = await read('app/composables/useNightCache.ts')
    expect(cache).toContain('export function firstUseOnDevice(')
    expect(cache).toContain('export function rememberHint(')
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
