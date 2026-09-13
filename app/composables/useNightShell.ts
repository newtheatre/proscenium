import { DEFAULT_EYEBROW, bindNightEyebrow, bindNightFallbackSubject, bindNightSubject } from './useNightHeader'
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import type { NightHeaderState, NightSubject } from './useNightHeader'
import type { NightRole } from '#shared/utils/night-authority'

// The one show-night header lives in the layout, so every screen carries the same back arrow, the
// same show title and the same on-shift badge; a screen says what goes in it through this state.
export function useNightHeader(): Ref<NightHeaderState> {
  return useState<NightHeaderState>('nnt-night-header', () => ({ eyebrow: DEFAULT_EYEBROW, subject: null, fallback: null }))
}

// Two setters, not one: `NightScreen` owns the eyebrow and the page owns the show, so neither
// wipes the other's half as components set up and tear down around a navigation.
export function setNightEyebrow(eyebrow: () => string): void {
  bindNightEyebrow(useNightHeader(), eyebrow)
}

// A getter rather than a value: the show title arrives after the first fetch, and the header has
// to follow it.
export function setNightSubject(subject: () => NightSubject): void {
  bindNightSubject(useNightHeader(), subject)
}

// The shell's own answer for a screen that names no show: whichever of tonight's performances is
// running now, so every show-night screen carries the same header the hub does.
export function setNightFallbackSubject(fallback: () => NightSubject | null): void {
  bindNightFallbackSubject(useNightHeader(), fallback)
}

export interface NightPerformance { id: string, showTitle: string, startsAt: number, venueName: string, active: boolean }

export interface NightAuthority {
  roles: NightRole[]
  via: 'SHIFT' | 'OFFICER' | null
  performances: NightPerformance[]
}

export function useNightAuthority(): Ref<NightAuthority> {
  return useState<NightAuthority>('nnt-night-authority', () => ({ roles: [], via: null, performances: [] }))
}

// Which of tonight's roles the viewer actually holds, asked of the server rather than read from a
// standing grant (0009, 0044). Hiding a tile is never the enforcement: every route guards itself.
export function resolveNightAuthority(): void {
  const request = useRequestFetch()
  const resolved = useNightAuthority()

  // On mount and not during setup: an officer's resolution writes a bypass audit row, and a
  // server render would write one for a page nobody ever acted on (0044).
  onMounted(async () => {
    const answers = await Promise.allSettled(NIGHT_ROLES.map(async (role) => {
      const answered = await request<{ via: 'SHIFT' | 'OFFICER', performances: NightPerformance[] }>('/api/tonight/authority', { query: { role } })
      return { role, via: answered.via, performances: answered.performances }
    }))

    const held = answers.flatMap(answer => answer.status === 'fulfilled' ? [answer.value] : [])
    // A shift is the ordinary way in, so it wins the badge wherever the viewer holds both.
    resolved.value = {
      roles: held.map(one => one.role),
      via: held.some(one => one.via === 'SHIFT') ? 'SHIFT' : (held.length > 0 ? 'OFFICER' : null),
      performances: held[0]?.performances ?? [],
    }
  })
}
