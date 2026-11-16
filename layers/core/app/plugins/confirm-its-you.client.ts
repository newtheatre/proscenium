// Every request the app sends through $fetch is confirmed in place when the server asks (ID-28): a
// refusal of "confirm it is you" opens the dialogue, and once the person confirms, the request is
// sent again, once. A screen therefore needs nothing of its own to get this. The dialogue's own
// requests are left alone, so a refusal there cannot open a second dialogue.
import { CONFIRM_REASONS, type ConfirmReason } from '../composables/useConfirmItsYou'

const OWN = '/api/core/me/reassert'

export default defineNuxtPlugin(() => {
  const { confirmItsYou } = useConfirmItsYou()
  // Typed loosely: the app's typed $fetch compares every route, which is too deep to restate here.
  type Loose = ((request: unknown, options?: unknown) => Promise<unknown>) & { raw: unknown, create: unknown }
  const original = globalThis.$fetch as unknown as Loose
  const wrapped = (async (request: unknown, options?: unknown) => {
    try {
      return await original(request, options)
    }
    catch (error) {
      const e = error as { statusCode?: number, data?: { code?: string } | null }
      const code = e?.data?.code
      const path = typeof request === 'string' ? request : ''
      if (e?.statusCode !== 403 || !code || !CONFIRM_REASONS.includes(code) || path.startsWith(OWN)) throw error
      if (!(await confirmItsYou(code as ConfirmReason))) throw error
      return original(request, options)
    }
  }) as Loose
  Object.assign(wrapped, { raw: original.raw, create: original.create })
  globalThis.$fetch = wrapped as unknown as typeof globalThis.$fetch
})
