import { describe, expect, test } from 'bun:test'
import { NIGHT_TAP_TARGET_PX, NIGHT_VIEWPORT_PX, lastSyncedLabel } from '#shared/utils/night-shell'

// K-102: the shell every show-night screen is built from. The door, the till and the registers
// inherit these rules by using the primitives, so the primitives are what the tests hold.

const COMPONENTS = ['NightScreen', 'NightAction', 'NightStale'] as const
const LAYOUT = 'app/layouts/tonight.vue'

const read = (path: string): Promise<string> => Bun.file(path).text()
const component = (name: string): Promise<string> => read(`app/components/${name}.vue`)

// Anything that only exists under a pointer, or needs a second finger or a held press.
const POINTER_ONLY = /\bhover:|group-hover:|@(mouseenter|mouseover|mouseleave|dblclick|contextmenu|touchstart|touchend)\b|v-on:(mouseenter|mouseover|contextmenu)/

describe('the stale label (K-102, "last synced HH:MM")', () => {
  test('is London wall-clock time in summer', () => {
    expect(lastSyncedLabel(new Date('2026-07-15T18:42:00Z'))).toBe('Last synced 19:42')
  })

  test('and in winter', () => {
    expect(lastSyncedLabel(new Date('2026-01-15T18:42:00Z'))).toBe('Last synced 18:42')
  })

  test('keeps two digits past midnight, when the night is still running', () => {
    expect(lastSyncedLabel(new Date('2026-11-15T00:05:00Z'))).toBe('Last synced 00:05')
  })

  test('takes a timestamp or an ISO string, which is what a cache stores', () => {
    expect(lastSyncedLabel(Date.UTC(2026, 6, 15, 18, 42))).toBe('Last synced 19:42')
    expect(lastSyncedLabel('2026-07-15T18:42:00.000Z')).toBe('Last synced 19:42')
  })

  test('says so in words when nothing has synced yet', () => {
    expect(lastSyncedLabel(null)).toBe('Not yet synced')
    expect(lastSyncedLabel(undefined)).toBe('Not yet synced')
  })

  // Not-yet-synced is a fact about the screen, so a value that is not an instant must not read as
  // one: it throws where the caller can see it (0014).
  test('refuses a value that is not an instant rather than calling it never synced', () => {
    expect(() => lastSyncedLabel('the interval')).toThrow()
  })
})

describe('the primitives exist under the names the streams build against', () => {
  for (const name of COMPONENTS) {
    test(`${name} is a component`, async () => {
      expect(await Bun.file(`app/components/${name}.vue`).exists()).toBe(true)
    })
  }
})

describe('a primary action fits a thumb (K-102 criterion 2)', () => {
  test('the target floor is 48 pixels, as the story says', () => {
    expect(NIGHT_TAP_TARGET_PX).toBe(48)
    expect(NIGHT_VIEWPORT_PX).toBe(360)
  })

  // Tailwind spacing is 4px a step, so the class that guarantees the floor is derivable from it.
  test('NightAction guarantees the floor in both dimensions', async () => {
    const source = await component('NightAction')
    const step = NIGHT_TAP_TARGET_PX / 4
    expect(source).toContain(`min-h-${step}`)
    expect(source).toContain(`min-w-${step}`)
  })

  test('nothing in the shell needs a pointer, a second finger or a held press', async () => {
    const offenders: string[] = []
    const files = [LAYOUT, ...COMPONENTS.map(name => `app/components/${name}.vue`)]
    for (const file of files) {
      const source = await read(file)
      source.split('\n').forEach((line, index) => {
        if (POINTER_ONLY.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  test('NightScreen has a slot for the actions, which is what puts them under the thumb', async () => {
    expect(await component('NightScreen')).toContain('name="actions"')
  })
})

describe('the tonight shell (K-102 criteria 1 and 3)', () => {
  test('the layout is a dark subtree with a main landmark and no dashboard', async () => {
    const source = await read(LAYOUT)
    expect(source).toMatch(/class="[^"]*\bdark\b/)
    expect(source).toContain('<main')
    expect(source).not.toContain('UDashboard')
  })

  // The desktop layout is the adaptation: the column is capped and centred, and nothing in the
  // shell starts from a wide layout and squeezes down.
  test('the shell adapts upwards from the phone, never downwards from a desk', async () => {
    const files = [LAYOUT, ...COMPONENTS.map(name => `app/components/${name}.vue`)]
    const offenders: string[] = []
    for (const file of files) {
      const source = await read(file)
      source.split('\n').forEach((line, index) => {
        if (/\bmax-(sm|md|lg|xl):/.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
    expect(await component('NightScreen')).toMatch(/\bmax-w-/)
  })

  test('every page under /tonight wears the layout and is a NightScreen', async () => {
    const pages = [...new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages/tonight', onlyFiles: true })].sort()
    expect(pages.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const page of pages) {
      const source = await read(`app/pages/tonight/${page}`)
      if (!/layout:\s*'tonight'/.test(source)) offenders.push(`${page}: not on the tonight layout`)
      if (!source.includes('<NightScreen')) offenders.push(`${page}: not a NightScreen`)
    }
    expect(offenders).toEqual([])
  })
})
