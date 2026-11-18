// Every address under a shell's prefix asks the server whether this viewer may open it before the
// page renders, so no shell is ever drawn empty and a deep link gets the same answer as the menu
// (UI-07, UI-08). The server answers; this only acts on the answer.
//
// The server is asked on every server render and for any address the browser cannot vouch for. In
// the browser two cases need no request: the page the server has just rendered (it has already
// answered), and an address that is exactly an entry of the menu this viewer was given, or the home
// of a shell they are in, since the server only hands out entries the viewer may open. Anything
// else, a record's page included, is asked. The menu is fetched again in the background as the
// person moves about, so an entry that has since been withdrawn stops vouching for its address,
// and every API route checks the ability again whatever this decides.
import { shellOf, SHELL_PREFIXES, type ShellName } from '../../shared/navigation'
import type { RefusalView } from '../utils/refusal'
import type { ShellNavigation } from '../composables/useNavigation'
import type { Viewer } from '../composables/useViewer'

type Answer = { decision: 'allow' | 'sign-in' | 'not-found' } | { decision: 'redirect', to: string } | { decision: 'refused', refusal: Pick<RefusalView, 'code' | 'reason' | 'remedy'> }

const REFRESH_EVERY = 30_000 // not-policy: how often, at most, the menu is fetched again while moving about
let refreshedAt = 0

/** Whether what this viewer was given says, on its face, that they may open this exact address. */
function vouchedFor(shell: ShellName, path: string): boolean {
  const clean = path.replace(/(?<=.)\/$/, '')
  const viewer = useNuxtData<Viewer>('core:viewer').data.value
  if (!viewer?.signedIn) return false
  // The viewer's description names the sides open to them; any other shell's home is asked.
  if (clean === SHELL_PREFIXES[shell]) return shell === 'account' || ((shell === 'members' || shell === 'console') && viewer.sides.includes(shell))
  const menu = useNuxtData<ShellNavigation>(`core:navigation:${shell}`).data.value
  const given = [
    ...viewer.navigation.filter(e => e.shell === shell),
    ...(menu?.items ?? []),
    ...(menu?.groups ?? []).flatMap(g => [...g.everyday, ...g.setup]),
  ]
  return given.some(e => e.to.replace(/(?<=.)\/$/, '') === clean)
}

export default defineNuxtRouteMiddleware(async (to) => {
  const shell = shellOf(to.path)
  if (!shell) return
  if (import.meta.client) {
    const nuxtApp = useNuxtApp()
    if (nuxtApp.isHydrating && nuxtApp.payload.serverRendered) return
    if (vouchedFor(shell, to.path)) {
      if (Date.now() - refreshedAt > REFRESH_EVERY) {
        refreshedAt = Date.now()
        void refreshNuxtData(['core:viewer', `core:navigation:${shell}`])
      }
      return
    }
  }
  let answer: Answer
  try {
    answer = await useRequestFetch()<Answer>('/api/core/access', { query: { path: to.fullPath } })
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 503
    // Too many requests is its own page, which says to wait and offers to try again.
    throw createError({ statusCode: status, statusMessage: status === 429 ? 'Too many requests' : 'This page could not be checked', fatal: true })
  }
  if (answer.decision === 'refused') throw createError({ statusCode: 403, statusMessage: 'Not allowed', data: answer.refusal, fatal: true })
  if (answer.decision === 'redirect') return navigateTo(answer.to, { replace: true })
  if (answer.decision === 'sign-in') return navigateTo({ path: '/sign-in', query: { next: to.fullPath } })
  if (answer.decision === 'not-found') throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
})
