import { computed, createError, navigateTo, ref, useRequestFetch, useState, watch } from '#imports'

export type TrainingTarget = 'bar-till' | 'challenge-25' | 'door-scan'

export interface TrainingEvent {
  id: string
  kind: 'SALE' | 'AGE_CHECK' | 'ADMISSION' | 'LOOKUP'
  payload: Record<string, unknown> | null
  at: string
}

export interface TrainingState {
  active: boolean
  targetKey: TrainingTarget | null
  expiresAt: string | null
  events: TrainingEvent[]
}

const IDLE: TrainingState = { active: false, targetKey: null, expiresAt: null, events: [] }

/** Which sandbox each screen belongs to, matching the server's own map. */
export const SURFACE_TARGET: Record<string, TrainingTarget> = {
  till: 'bar-till',
  ageChecks: 'challenge-25',
  door: 'door-scan',
}

/**
 * Whether this screen is practice, and where its API lives. One page serves
 * both modes so what you practise cannot drift from the real thing (docs/14 §8).
 */
export function useTrainingMode() {
  const state = useState<TrainingState>('training-state', () => ({ ...IDLE }))
  // Pinned per page, not per state: a screen entered as practice stays that
  // way, so a run ending mid-basket cannot quietly retarget it at real data.
  const pinned = useState<boolean>('training-pinned', () => false)
  const requestFetch = useRequestFetch()
  const busy = ref(false)

  const active = computed(() => state.value.active)
  /** Prepended to every fetch on a dual-mode screen. */
  const prefix = computed(() => (state.value.active ? '/api/training' : ''))

  /**
   * The URL for a dual-mode fetch. Refuses rather than resolving to the live
   * route once a pinned run has ended (ADR-0032).
   */
  function api(path: string): string {
    if (pinned.value && !state.value.active) {
      const message = 'Practice has ended. Nothing was sent. Go back to Front of House and start again.'
      // `data` too: every caller's catch reads the message from there.
      throw createError({ statusCode: 409, statusMessage: message, data: { statusMessage: message } })
    }
    return `${prefix.value}${path}`
  }

  async function refresh() {
    try {
      state.value = await requestFetch<TrainingState>('/api/training/state')
    }
    catch {
      // A member who cannot work FOH gets a 403 here, which is not an error.
      state.value = { ...IDLE }
    }
  }

  async function start(target: TrainingTarget) {
    busy.value = true
    try {
      await requestFetch('/api/training/start', { method: 'POST', body: { target } })
      await refresh()
    }
    finally {
      busy.value = false
    }
  }

  async function end() {
    busy.value = true
    try {
      await requestFetch('/api/training/end', { method: 'POST' })
      await refresh()
    }
    finally {
      busy.value = false
    }
  }

  /** True when this screen is the one the open sandbox is for. */
  function isPracticing(surface: keyof typeof SURFACE_TARGET) {
    return computed(() => state.value.active && state.value.targetKey === SURFACE_TARGET[surface])
  }

  /**
   * Enter a sandbox from a `?practice=1` link. A refusal must never fall
   * through to the live screen, so it leaves rather than continuing.
   */
  async function enter(target: TrainingTarget) {
    try {
      await start(target)
    }
    catch (error) {
      const message = (error as { data?: { statusMessage?: string } }).data?.statusMessage
      await navigateTo({ path: '/foh', query: { practice: 'unavailable', reason: message ?? '' } })
      return false
    }
    pinned.value = true
    return true
  }

  /**
   * Leave the moment a run ends, however it ended. The alternative is a screen
   * whose buttons have quietly become real.
   */
  function leaveWhenPracticeEnds() {
    watch(active, (now, before) => {
      if (before && !now) {
        pinned.value = false
        navigateTo({ path: '/foh', query: { practice: 'ended' } })
      }
    })
  }

  return { state, active, prefix, api, pinned, busy, refresh, start, end, enter, leaveWhenPracticeEnds, isPracticing }
}
