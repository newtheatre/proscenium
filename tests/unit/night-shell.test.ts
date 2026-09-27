import { describe, expect, test } from 'bun:test'
import { effectScope, nextTick, ref } from 'vue'
import { NIGHT_STALE_AFTER_MS, NIGHT_TAP_TARGET_PX, NIGHT_VIEWPORT_PX, lastSyncedLabel, nightFreshness, staleAnnouncement } from '#shared/utils/night-shell'
import { bindNightEyebrow, bindNightFallbackSubject, bindNightSubject } from '#composables/useNightHeader'
import type { NightHeaderState } from '#composables/useNightHeader'

// K-102: the shell every show-night screen is built from. The door, the till and the registers
// inherit these rules by using the primitives, so the primitives are what the tests hold.

const COMPONENTS = ['NightScreen', 'NightAction', 'NightStale'] as const
const LAYOUT = 'app/layouts/tonight.vue'

const read = (path: string): Promise<string> => Bun.file(path).text()
const component = (name: string): Promise<string> => read(`app/components/${name}.vue`)

// Anything that only exists under a pointer, or needs a second finger or a held press.
const POINTER_ONLY = /\bhover:|group-hover:|@(mouseenter|mouseover|mouseleave|dblclick|contextmenu|touchstart|touchend)\b|v-on:(mouseenter|mouseover|contextmenu)/

// Anything keyed to the window's width: `sm:` to `2xl:`, arbitrary `min-[...]:` and `max-[...]:`,
// and a width `@media` rule. A container's `@md:` or `@min-[...]:` passes, as does any other media query.
const WINDOW_WIDTH = /(?<![\w@-])(?:max-)?(?:sm|md|lg|xl|2xl):|(?<![\w@-])(?:min|max)-\[[^\]]+\]:|@media[^{]*\bwidth\b/

// Tailwind's container scale in rem, which both `max-w-*` and the `@*:` variants read.
const CONTAINER_REM: Record<string, number> = {
  '3xs': 16, '2xs': 18, 'xs': 20, 'sm': 24, 'md': 28, 'lg': 32, 'xl': 36,
  '2xl': 42, '3xl': 48, '4xl': 56, '5xl': 64, '6xl': 72, '7xl': 80,
}
const capOf = (source: string): number | undefined => CONTAINER_REM[source.match(/\bmax-w-([\w-]+)/)?.[1] ?? '']

const STOCKTAKE_COUNTS = 'app/components/stocktake/Counts.vue'
// What the flexible first column keeps for the item's name once the fixed columns are paid for.
const ROOM_FOR_A_NAME_REM = 10

// Nuxt's own names for the application's components, from the declarations `nuxt prepare` writes
// on install, so the walk below never has to reimplement Nuxt's naming.
async function componentFiles(): Promise<Map<string, string>> {
  const declared = await read('.nuxt/components.d.ts')
  const named = new Map<string, string>()
  for (const [, name, path] of declared.matchAll(/export const (\w+): typeof import\("\.\.\/(app\/components\/[^"]+\.vue)"\)/g)) {
    named.set(name!, path!)
    named.set(name!.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(), path!)
  }
  return named
}

// Every file drawn inside the tonight layout, with its source: the layout, each page on it, and
// every component those reach by tag, in either case.
async function tonightTree(): Promise<Map<string, string>> {
  const named = await componentFiles()
  const tag = new RegExp(`<(?:Lazy|lazy-)?(${[...named.keys()].join('|')})[\\s/>]`, 'g')
  const sources = new Map<string, string>()
  const queue = [LAYOUT]
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages', onlyFiles: true })) {
    const path = `app/pages/${entry.replaceAll('\\', '/')}`
    const source = await read(path)
    if (/layout:\s*'tonight'/.test(source)) {
      sources.set(path, source)
      queue.push(path)
    }
  }
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const source = sources.get(file) ?? await read(file)
    sources.set(file, source)
    for (const [, name] of source.matchAll(tag)) queue.push(named.get(name!)!)
  }
  return new Map([...sources].sort(([a], [b]) => a.localeCompare(b)))
}

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

  // Issue 1520: every page on the tonight layout is a capped column at any window width, so what
  // changes shape inside it must key to its container; a window variant fires while it is still narrow.
  test('every page on the tonight layout is a capped column, laid out by container and never by window', async () => {
    const tree = await tonightTree()
    expect([...tree.keys()]).toContain(STOCKTAKE_COUNTS)
    const offenders: string[] = []
    for (const [file, source] of tree) {
      if (file.startsWith('app/pages/') && !source.includes('<NightScreen') && capOf(source) === undefined) {
        offenders.push(`${file}: neither a NightScreen nor a capped column`)
      }
      source.split('\n').forEach((line, index) => {
        if (WINDOW_WIDTH.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  test('a stocktake line takes its three columns only where its container holds them', async () => {
    const source = await read(STOCKTAKE_COUNTS)
    expect(source).toMatch(/class="@container\b/)
    const line = source.match(/class="([^"]*@[\w-]+:grid-cols-[^"]*)"/)?.[1] ?? ''
    const grid = line.match(/@([\w-]+):grid-cols-\[minmax\(0,1fr\)((?:_minmax\(0,[\d.]+rem\))+)\]/)
    expect(grid).not.toBeNull()
    const [, size, fixed] = grid!
    const fixedRem = [...fixed!.matchAll(/([\d.]+)rem/g)].reduce((sum, [, rem]) => sum + Number(rem), 0)
    const gaps = fixed!.split('_').length - 1
    // Tailwind spacing is a quarter rem a step; the list's border is a pixel each side.
    const step = (utility: string): number => Number(line.match(new RegExp(`(?:^|\\s)${utility}-(\\d+)(?:\\s|$)`))?.[1] ?? 0) / 4
    const needed = fixedRem + gaps * step('gap') + 2 * step('p') + 2 / 16 + ROOM_FOR_A_NAME_REM
    expect(CONTAINER_REM[size!]).toBeGreaterThanOrEqual(needed)
    const column = capOf(await component('NightScreen'))
    expect(column).toBeDefined()
    expect(CONTAINER_REM[size!]).toBeGreaterThan(column!)
  })

  // The hub is the exception, and only the hub: it is the navigation rather than a screen with
  // work on it, so it spends the whole viewport on its six tiles (E-112 criterion 1).
  const THE_HUB = 'index.vue'

  test('every page under /tonight wears the layout, and every one but the hub is a NightScreen', async () => {
    const pages = [...new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages/tonight', onlyFiles: true })].sort()
    expect(pages.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const page of pages) {
      const source = await read(`app/pages/tonight/${page}`)
      if (!/layout:\s*'tonight'/.test(source)) offenders.push(`${page}: not on the tonight layout`)
      if (page !== THE_HUB && !source.includes('<NightScreen')) offenders.push(`${page}: not a NightScreen`)
    }
    expect(offenders).toEqual([])
  })

  // The hub still has to be a show-night screen in every other respect, so the two primitives it
  // does use are checked here rather than left to the e2e suite alone.
  test('the hub is built from the show-night primitives it does use', async () => {
    const source = await read(`app/pages/tonight/${THE_HUB}`)
    expect(source).toContain('<NightTile')
    expect(source).toContain('<NightStale')
  })
})

// The three bindings share one piece of state across the layout, the screen and the page. A
// binding that woke the others on every write froze the whole tab in production (issue 1018).
describe('the show-night header setters settle (E-112 criterion 1)', () => {
  const blank = (): NightHeaderState => ({ eyebrow: 'Show night', subject: null, fallback: null })

  test('a change to one field settles without waking the others', async () => {
    const header = ref<NightHeaderState>(blank())
    const title = ref('Tonight')
    const running = ref<{ title: string, meta: string | null } | null>(null)
    let subjectRuns = 0
    let fallbackRuns = 0
    const scope = effectScope()
    scope.run(() => {
      bindNightEyebrow(header, () => 'Door')
      bindNightSubject(header, () => {
        subjectRuns++
        return { title: title.value, meta: null }
      })
      bindNightFallbackSubject(header, () => {
        fallbackRuns++
        return running.value
      })
    })
    await nextTick()
    title.value = 'Machinal'
    running.value = { title: 'Machinal', meta: '19:30, Main Hall' }
    // The development build throws "Maximum recursive updates exceeded" here when they loop.
    await nextTick()
    expect(header.value).toEqual({ eyebrow: 'Door', subject: { title: 'Machinal', meta: null }, fallback: { title: 'Machinal', meta: '19:30, Main Hall' } })
    expect(subjectRuns).toBeLessThanOrEqual(3)
    expect(fallbackRuns).toBeLessThanOrEqual(3)
    scope.stop()
  })

  test('a screen tearing down clears only its own half of the header', async () => {
    const header = ref<NightHeaderState>(blank())
    const outer = effectScope()
    outer.run(() => bindNightFallbackSubject(header, () => ({ title: 'Machinal', meta: null })))
    const inner = effectScope()
    inner.run(() => {
      bindNightEyebrow(header, () => 'Door')
      bindNightSubject(header, () => ({ title: 'The door', meta: null }))
    })
    await nextTick()
    inner.stop()
    expect(header.value).toEqual({ eyebrow: 'Show night', subject: null, fallback: { title: 'Machinal', meta: null } })
    outer.stop()
  })
})

// A label that ticks every 20 seconds under aria-live reads the clock out over and over. What a
// screen reader is owed is the change from fresh to stale and back (K-101 criterion 3).
describe('the staleness a screen reader hears (K-101 criterion 3, issue 1150 item 15)', () => {
  const at = Date.UTC(2026, 6, 15, 18, 42)

  test('the threshold is longer than any show-night screen\'s own refresh', () => {
    expect(NIGHT_STALE_AFTER_MS).toBeGreaterThan(20_000)
  })

  test('just synced is fresh, and stays fresh across a poll or two', () => {
    expect(nightFreshness(at, at)).toBe('FRESH')
    expect(nightFreshness(at, at + NIGHT_STALE_AFTER_MS - 1)).toBe('FRESH')
  })

  test('past the threshold it is stale', () => {
    expect(nightFreshness(at, at + NIGHT_STALE_AFTER_MS)).toBe('STALE')
    expect(nightFreshness(at, at + 10 * NIGHT_STALE_AFTER_MS)).toBe('STALE')
  })

  test('nothing synced yet is neither fresh nor stale', () => {
    expect(nightFreshness(null, at)).toBe('NEVER')
    expect(nightFreshness(undefined, at)).toBe('NEVER')
  })

  test('a clock that has gone backwards still reads as fresh rather than stale', () => {
    expect(nightFreshness(at, at - 5_000)).toBe('FRESH')
  })

  test('what is announced is a state, never a time', () => {
    expect(staleAnnouncement('STALE')).toBe('These figures are no longer current.')
    expect(staleAnnouncement('FRESH')).toBe('These figures are current.')
    expect(staleAnnouncement('NEVER')).toBe('Nothing has synced yet.')
  })

  test('NightStale keeps aria-live off the label that ticks', async () => {
    const source = await component('NightStale')
    const ticking = source.slice(source.indexOf('<template>'))
    expect(ticking).toContain('sr-only')
    expect(ticking).toMatch(/data-test="night-stale"[^>]*>/)
    // The live region is the announcement, not the label: one aria-live in the component.
    expect(ticking.match(/aria-live/g)).toHaveLength(1)
    expect(ticking).toContain('{{ announcement }}')
  })
})

// Rule 4 of docs/design-language.md: the show-night shell stands on the viewport a phone actually
// shows, and every control on it clears 48 by 48, set once rather than per field.
describe('the show-night shell stands on the visible viewport (K-102, design-language rule 4)', () => {
  const LAYOUTS = ['app/layouts/tonight.vue', 'app/layouts/backstage.vue']
  const TOKEN_SOURCE = 'app/assets/css/theme.css'
  const SHELL_CLASS = 'nnt-night'

  test('both show-night layouts take the dynamic viewport height, never the fixed one', async () => {
    for (const layout of LAYOUTS) {
      const source = await read(layout)
      expect(`${layout}: ${source.includes('min-h-screen')}`).toBe(`${layout}: false`)
      expect(`${layout}: ${source.includes('min-h-dvh')}`).toBe(`${layout}: true`)
    }
  })

  test('the pinned area clears the phone\'s home indicator', async () => {
    expect(await component('NightScreen')).toContain('env(safe-area-inset-bottom)')
    expect(await read('app/layouts/backstage.vue')).toContain('env(safe-area-inset-bottom)')
  })

  test('the target floor is one rule for the shell, not a class per field', async () => {
    const theme = await read(TOKEN_SOURCE)
    expect(theme).toContain(`.${SHELL_CLASS} `)
    expect(theme).toContain(`min-height: ${NIGHT_TAP_TARGET_PX / 16}rem`)
    for (const layout of LAYOUTS) {
      expect(`${layout}: ${(await read(layout)).includes(SHELL_CLASS)}`).toBe(`${layout}: true`)
    }
  })
})
