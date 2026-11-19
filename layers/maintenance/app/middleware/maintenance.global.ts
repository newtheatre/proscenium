// A visitor already on the site who moves to another page without reloading would otherwise reach
// a page whose loads are refused while maintenance mode is on. In the browser, before a page that
// maintenance mode closes, this asks whether it is on (at most once a minute) and, if so, loads the
// address afresh so the server answers with the holding page. Staff are never held up.
import { isOpenAddress } from '../../shared/addresses'

const ASK_EVERY = 60_000 // not-policy: how often, at most, the browser asks again
let askedAt = 0
let state: { on: boolean, open: string[] } = { on: false, open: [] }

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || useNuxtApp().isHydrating) return
  if (isOpenAddress(to.path)) return
  const viewer = useNuxtData<{ sides: string[] }>('core:viewer').data.value
  if (viewer?.sides.some(side => side === 'console' || side === 'admin' || side === 'live')) return
  if (Date.now() - askedAt > ASK_EVERY) {
    askedAt = Date.now()
    state = await useNuxtApp().$api<{ on: boolean, open: string[] }>('/api/maintenance/state').catch(() => ({ on: false, open: [] }))
  }
  if (!state.on || isOpenAddress(to.path, state.open)) return
  window.location.assign(to.fullPath)
  return abortNavigation()
})
