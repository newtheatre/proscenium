// Practice mode in the app (Practice mode, part 5): whether this page practises, the panel's data
// read from the person's store, and what `$api` does on a practice page.
import { isPracticePath, liveOf, withinScenario } from '../../shared/practice'
import { forgetPracticeCopies, isChangeRequest } from '../utils/practice'

export type CardOutcome = 'approved' | 'declined' | 'removed' | 'no-answer'

/** PM-S4's data: the session, read inside the store (`GET /api/core/practice/session`). */
export interface PracticePanelData {
  scenario: { id: string, label: string, version: number, newer: boolean, start: string, routes: string[], runnable: string[] }
  startedAt: number
  endsAt: number
  idleEnd: number
  tasks: { id: string, label: string, passedAt: number | null }[]
  outbox: { id: string, typeKey: string, to: string, subject: string | null, at: number }[]
  waiting: { attemptId: string, call: string, reference: string, outcomes: CardOutcome[] }[]
  updated: boolean
}

/** PM-S1's data (`GET /api/core/practice`), read from the real database. */
export interface PracticeList {
  enabled: boolean
  checking: boolean
  scenarios: { id: string, label: string, summary: string, minutes: number, routes: string[], unavailable: { code: string, module?: string } | null }[]
  active: { scenarioId: string, startedAt: number } | null
  ended: { reason: string, scenarioId: string } | null
}

const PANEL = 'core:practice:session'
const LIST = 'core:practice:list'
const OUTSIDE = ['/api/core/practice/start', '/api/core/practice/leave']

/** Whether this page is one of practice mode's, and whether it is a live page in the frame. */
export function usePractising() {
  const route = useRoute()
  return {
    practising: computed(() => isPracticePath(route.path)),
    framed: computed(() => liveOf(route.path) !== null),
  }
}

/** The panel, read from the store in the browser; every practice change reads it again, so tasks tick. */
export function usePracticePanel() {
  return useAPI<PracticePanelData>('/api/core/practice/session', { key: PANEL, server: false })
}

/** The scenarios open to this person, read once a visit in the browser: the live screens' Practise entries. */
export function usePracticeList() {
  return useAPI<PracticeList>('/api/core/practice', { key: LIST, server: false, lazy: true, getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] })
}

/** Where a live screen's "Practise this screen" goes: the first open scenario covering it, or null. */
export function usePractiseThisScreen() {
  const route = useRoute()
  const { data } = usePracticeList()
  return computed(() => {
    if (!data.value?.enabled || isPracticePath(route.path)) return null
    const s = data.value.scenarios.find(c => !c.unavailable && c.routes.some(r => withinScenario(route.path, [r]) && route.path !== '/live'))
    return s ? `/practice/${encodeURIComponent(s.id)}?from=${encodeURIComponent(route.fullPath)}` : null
  })
}

/** What `$api` asks of practice mode (plugins/api.ts). */
export function usePracticeSignals() {
  const overlay = useOverlay()
  return {
    /** A change committed in the store: the panel is read again. Starting and leaving are not in the store. */
    changed(request: string, options: unknown) {
      if (isChangeRequest(options) && !OUTSIDE.some(p => request.startsWith(p))) void refreshNuxtData(PANEL)
    },
    /** The store has gone under a framed page: the Ended screen says why (PM-S6). */
    ended() {
      if (liveOf(useRouter().currentRoute.value.path) === null) return
      const id = useNuxtData<PracticePanelData>(PANEL).data.value?.scenario.id
      void navigateTo(id ? `/practice/${encodeURIComponent(id)}?ended=1` : '/practice', { replace: true })
    },
    /** M6: the pretend "confirm it's you", which accepts a press and touches only the store. */
    async confirm(): Promise<boolean> {
      const { default: component } = await import('../components/PracticeConfirmDialog.vue')
      return (await overlay.create(component, { destroyOnClose: true }).open().result) === true
    },
  }
}

const FROM = 'core.practice.from'

/** Where leaving goes: the page that opened practice (a lesson), or the Tonight hub. */
function returnTo(): string {
  try {
    const from = sessionStorage.getItem(FROM)
    if (from?.startsWith('/') && !from.startsWith('//') && !isPracticePath(from)) return from
  }
  catch {
    // Storage refused: the hub.
  }
  return '/live'
}

/** Leaving and starting again, from the panel, the fence and the Ended screen. */
export function usePracticeActions() {
  const { $api } = useNuxtApp()
  const leaving = useState('core:practice:leaving', () => false)
  return {
    /** Remembers the page that opened practice, so leaving returns there. */
    remember(from: unknown) {
      try {
        if (typeof from === 'string') sessionStorage.setItem(FROM, from)
      }
      catch {
        // Storage refused: leaving goes to the hub.
      }
    },
    /** S5: ends the session, forgets the device's practice copies and goes back to where practice began. */
    async leave() {
      await $api('/api/core/practice/leave', { method: 'POST', body: {} })
      forgetPracticeCopies()
      leaving.value = true
      await navigateTo(returnTo(), { replace: true })
      clearNuxtData(PANEL)
    },
    /** Starts, carries on or starts again (S2 to S4, S8), then opens the scenario's live page. */
    async start(scenario: string, options: { again?: boolean, replace?: boolean } = {}) {
      const answer = await $api<{ to: string }>('/api/core/practice/start', { method: 'POST', body: { scenario, ...options } })
      if (options.again || options.replace) forgetPracticeCopies()
      await navigateTo(answer.to, { replace: true })
    },
  }
}
