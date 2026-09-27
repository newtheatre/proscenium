import { DEFAULT_EYEBROW, bindNightEyebrow, bindNightFallbackSubject, bindNightSubject } from './useNightHeader'
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import { hubRefusal } from '#shared/utils/refusals'
import type { NightHeaderState, NightSubject } from './useNightHeader'
import type { SettledRead } from '~/utils/refusal'
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

// What `GET /api/tonight/authority` answers for one role, or with none for the most specific of the
// three; only the fields a screen reads.
export interface NightAuthorityAnswer { via: NightAuthorityVia, performanceIds: string[], performances: NightPerformance[] }

export type NightAuthorityAsk = NightRole | 'ANY'

export interface NightAuthority {
  roles: NightRole[]
  via: 'SHIFT' | 'OFFICER' | null
  performances: NightPerformance[]
  // Whether any role had a definite answer for a signed-in viewer: until one does, signed out, or
  // with no signal, `roles` is not yet known and a screen drawing by role draws all (issue 1304).
  known: boolean
  // Refused every role for a reason more specific than no shift: what the hub says instead.
  refusal: string | null
  // Each answer as it came, for a screen's served first read to reuse within the same request.
  answers: Partial<Record<NightAuthorityAsk, SettledRead<NightAuthorityAnswer>>>
}

export function useNightAuthority(): Ref<NightAuthority> {
  return useState<NightAuthority>('nnt-night-authority', unknownNightAuthority)
}

function unknownNightAuthority(): NightAuthority {
  return { roles: [], via: null, performances: [], known: false, refusal: null, answers: {} }
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
  // With no role the server ranks the three refusals and names the most specific (issue 1411).
  const [any, ...byRole] = await Promise.all([
    askNightAuthorityWith(request, 'ANY'),
    ...NIGHT_ROLES.map(role => askNightAuthorityWith(request, role)),
  ])
  const answers: NightAuthority['answers'] = { ANY: any }
  NIGHT_ROLES.forEach((role, at) => {
    answers[role] = byRole[at]
  })

  const held = NIGHT_ROLES.flatMap((role) => {
    const answer = answers[role]
    return answer?.kind === 'READ' ? [{ role, ...answer.value }] : []
  })
  const known = byRole.some(answer => answer.kind === 'READ' || answer.status === 403)
  const said = held.length === 0 && known && any.kind === 'FAILED' ? any.failure : null
  // A shift is the ordinary way in, so it wins the badge wherever the viewer holds both; a duty
  // manager covering the door is on their own shift, so cover reads as a shift too (0095).
  resolved.value = {
    roles: held.map(one => one.role),
    via: held.some(one => one.via !== 'OFFICER') ? 'SHIFT' : (held.length > 0 ? 'OFFICER' : null),
    performances: held[0]?.performances ?? [],
    known,
    refusal: hubRefusal(said),
    answers,
  }
}

function askNightAuthorityWith(request: ReturnType<typeof useRequestFetch>, role: NightAuthorityAsk): Promise<SettledRead<NightAuthorityAnswer>> {
  return settleRead(() => request<NightAuthorityAnswer>('/api/tonight/authority', { query: role === 'ANY' ? {} : { role } }))
}

// A screen's own authority, as of this visit. A served render reuses the answer the shell asked in the
// same request; a phone always asks afresh, since a shift opens only in its window (0078, E-111).
export function askNightAuthority(role: NightAuthorityAsk): Promise<SettledRead<NightAuthorityAnswer>> {
  const seeded = import.meta.server ? useNightAuthority().value.answers[role] : undefined
  return seeded ? Promise.resolve(seeded) : askNightAuthorityWith(useRequestFetch(), role)
}
