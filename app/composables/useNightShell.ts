import { DEFAULT_EYEBROW, bindNightEyebrow, bindNightFallbackSubject, bindNightSubject } from './useNightHeader'
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import { hubRefusal } from '#shared/utils/refusals'
import type { NightHeaderState, NightSubject } from './useNightHeader'
import type { NightAuthorityVia, NightRole } from '#shared/utils/night-authority'

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
  // Whether any role had a definite answer for a signed-in viewer: until one does, signed out, or
  // with no signal, `roles` is not yet known and a screen drawing by role draws all (issue 1304).
  known: boolean
  // Refused every role for a reason more specific than no shift: what the hub says instead.
  refusal: string | null
}

export function useNightAuthority(): Ref<NightAuthority> {
  return useState<NightAuthority>('nnt-night-authority', unknownNightAuthority)
}

function unknownNightAuthority(): NightAuthority {
  return { roles: [], via: null, performances: [], known: false, refusal: null }
}

// Which of tonight's roles the viewer actually holds, asked of the server rather than read from a
// standing grant (0009, 0044). Hiding a tile is never the enforcement: every route guards itself.
export async function resolveNightAuthority(): Promise<void> {
  const request = useRequestFetch()
  const resolved = useNightAuthority()
  const { account, refresh } = useAccount()

  // Signed out, every role answers 401, which says nothing; the phone's snapshot is checked first,
  // as `signed-in` does, since a session may have begun since it was read.
  if (import.meta.client && !account.value.signedIn) await refresh().catch(() => undefined)
  if (!account.value.signedIn) {
    resolved.value = unknownNightAuthority()
    return
  }

  // A role check is a read, so it records no officer bypass however often a screen makes it (0098).
  const answers = await Promise.allSettled(NIGHT_ROLES.map(async (role) => {
    const answered = await request<{ via: NightAuthorityVia, performances: NightPerformance[] }>('/api/tonight/authority', { query: { role } })
    return { role, via: answered.via, performances: answered.performances }
  }))

  const held = answers.flatMap(answer => answer.status === 'fulfilled' ? [answer.value] : [])
  const known = answers.some(answer => answer.status === 'fulfilled' || refusalStatus(answer.reason) === 403)
  // Asked with no role, the server ranks the three refusals and names the most specific (issue 1411).
  const said = held.length === 0 && known
    ? await request('/api/tonight/authority').then(() => null, (refused: unknown) => refusalText(refused))
    : null
  // A shift is the ordinary way in, so it wins the badge wherever the viewer holds both; a duty
  // manager covering the door is on their own shift, so cover reads as a shift too (0095).
  resolved.value = {
    roles: held.map(one => one.role),
    via: held.some(one => one.via !== 'OFFICER') ? 'SHIFT' : (held.length > 0 ? 'OFFICER' : null),
    performances: held[0]?.performances ?? [],
    known,
    refusal: hubRefusal(said),
  }
}
