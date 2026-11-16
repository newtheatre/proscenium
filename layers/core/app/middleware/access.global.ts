// Every address under a shell's prefix asks the server whether this viewer may open it before the
// page renders, so no shell is ever drawn empty and a deep link gets the same answer as the menu
// (UI-07, UI-08). The server answers; this only acts on the answer.
import { shellOf } from '../../shared/navigation'
import type { RefusalView } from '../composables/useRefusal'

type Answer = { decision: 'allow' | 'sign-in' | 'not-found' } | { decision: 'refused', refusal: Pick<RefusalView, 'code' | 'reason' | 'remedy'> }

export default defineNuxtRouteMiddleware(async (to) => {
  if (!shellOf(to.path)) return
  let answer: Answer
  try {
    answer = await useRequestFetch()<Answer>('/api/core/access', { query: { path: to.path } })
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode ?? 503
    throw createError({ statusCode: status, statusMessage: 'This page could not be checked', fatal: true })
  }
  if (answer.decision === 'refused') throw createError({ statusCode: 403, statusMessage: 'Not allowed', data: answer.refusal, fatal: true })
  if (answer.decision === 'sign-in') return navigateTo({ path: '/sign-in', query: { next: to.fullPath } })
  if (answer.decision === 'not-found') throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
})
