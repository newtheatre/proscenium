import { computed, ref, useRequestFetch, useState } from '#imports'

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
  const requestFetch = useRequestFetch()
  const busy = ref(false)

  const active = computed(() => state.value.active)
  /** Prepended to every fetch on a dual-mode screen. */
  const prefix = computed(() => (state.value.active ? '/api/training' : ''))

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

  return { state, active, prefix, busy, refresh, start, end, isPracticing }
}
