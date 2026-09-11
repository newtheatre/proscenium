import { NIGHT_ROLES } from '#shared/utils/night-authority'
import type { NightRole } from '#shared/utils/night-authority'

export interface NightHeaderState {
  eyebrow: string
  title: string
  meta: string | null
}

const DEFAULT_EYEBROW = 'Show night'
const DEFAULT_SUBJECT = { title: 'Tonight', meta: null }

// The one show-night header lives in the layout, so every screen carries the same back arrow, the
// same show title and the same on-shift badge; a screen says what goes in it through this state.
export function useNightHeader(): Ref<NightHeaderState> {
  return useState<NightHeaderState>('nnt-night-header', () => ({ eyebrow: DEFAULT_EYEBROW, ...DEFAULT_SUBJECT }))
}

// Two setters, not one: `NightScreen` owns the eyebrow and the page owns the show, so neither
// wipes the other's half as components set up and tear down around a navigation.
export function setNightEyebrow(eyebrow: () => string): void {
  const header = useNightHeader()
  // Eagerly as well as reactively: a watcher does not run during a server render, and a header
  // filled in only on the client is a hydration mismatch on every show-night screen.
  header.value = { ...header.value, eyebrow: eyebrow() }
  watchEffect(() => {
    header.value = { ...header.value, eyebrow: eyebrow() }
  })
  onScopeDispose(() => {
    header.value = { ...header.value, eyebrow: DEFAULT_EYEBROW }
  })
}

// A getter rather than a value: the show title arrives after the first fetch, and the header has
// to follow it.
export function setNightSubject(subject: () => { title: string, meta: string | null }): void {
  const header = useNightHeader()
  // Eagerly as well, for the same reason `setNightEyebrow` is.
  header.value = { ...header.value, ...subject() }
  watchEffect(() => {
    header.value = { ...header.value, ...subject() }
  })
  onScopeDispose(() => {
    header.value = { ...header.value, ...DEFAULT_SUBJECT }
  })
}

export interface NightAuthority {
  roles: NightRole[]
  via: 'SHIFT' | 'OFFICER' | null
}

export function useNightAuthority(): Ref<NightAuthority> {
  return useState<NightAuthority>('nnt-night-authority', () => ({ roles: [], via: null }))
}

// Which of tonight's roles the viewer actually holds, asked of the server rather than read from a
// standing grant (0009, 0044). Hiding a tile is never the enforcement: every route guards itself.
export function resolveNightAuthority(): void {
  const request = useRequestFetch()
  const resolved = useNightAuthority()

  // On mount and not during setup: an officer's resolution writes a bypass audit row, and a
  // server render would write one for a page nobody ever acted on (0044).
  onMounted(async () => {
    const answers = await Promise.allSettled(NIGHT_ROLES.map(async role =>
      ({ role, via: (await request<{ via: 'SHIFT' | 'OFFICER' }>('/api/tonight/authority', { query: { role } })).via })))

    const held = answers.flatMap(answer => answer.status === 'fulfilled' ? [answer.value] : [])
    // A shift is the ordinary way in, so it wins the badge wherever the viewer holds both.
    resolved.value = {
      roles: held.map(one => one.role),
      via: held.some(one => one.via === 'SHIFT') ? 'SHIFT' : (held.length > 0 ? 'OFFICER' : null),
    }
  })
}
