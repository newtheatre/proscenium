// Practice mode's fence (PM-S3, PM-S5, T-PM-16). From a framed practice page, a link to a live page
// opens that page in the frame instead, so a live screen's own links keep the trainee in practice;
// a page outside the scenario's routes, or outside live mode altogether, is not opened at all and
// PM-S5 says why, before any of its data is asked for. Leaving practice passes through. It runs
// before the access check, which would otherwise ask about the real page first.
import { isPracticePath, liveOf, practiceOf, withinScenario } from '../../shared/practice'
import type { PracticePanelData } from '../composables/usePractice'

export default defineNuxtRouteMiddleware((to, from) => {
  if (import.meta.server || to.fullPath === from.fullPath || liveOf(from.path) === null) return
  const leaving = useState('core:practice:leaving', () => false)
  if (leaving.value) {
    leaving.value = false
    return
  }
  const framed = practiceOf(to.fullPath)
  const live = liveOf(framed ?? to.path)
  if (live === null && isPracticePath(to.path)) return
  const routes = useNuxtData<PracticePanelData>('core:practice:session').data.value?.scenario.routes
  if (live === null || (routes && !withinScenario(live, routes))) {
    useState<string | null>('core:practice:fenced', () => null).value = to.fullPath
    return abortNavigation()
  }
  if (framed) return navigateTo(framed)
})
