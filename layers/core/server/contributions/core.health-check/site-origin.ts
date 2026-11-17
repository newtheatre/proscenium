// The site's one origin (Foundations part 4, "One origin, enforced"). Warns while none is recorded,
// since work outside a request (an email a job sends) cannot build a link, and shows when the
// Worker variable CORE_SITE_ORIGIN is in force, above all when it differs from the setting.
import type { HealthCheck } from '../../points/health-check'
import { useContext, useSetting } from '#kit'
import { normaliseOrigin } from '#kit/origin'

export default {
  async check() {
    const { env, requestOrigin } = useContext()
    const raw = env.CORE_SITE_ORIGIN
    const variable = normaliseOrigin(raw)
    const setting = normaliseOrigin(await useSetting('core.site.origin'))
    if (typeof raw === 'string' && raw.trim() && !variable)
      return { state: 'failing', sentence: `CORE_SITE_ORIGIN is set to "${raw}", which is not an address such as https://tickets.example.org, so it is ignored.`, remedy: 'Correct the Worker variable CORE_SITE_ORIGIN, or remove it.' }
    if (variable && setting && variable !== setting)
      return { state: 'warning', sentence: `The Worker variable CORE_SITE_ORIGIN (${variable}) is in force, and differs from the site's recorded address (${setting}).`, remedy: `Once ${variable} works, record it as the site's address under Site administration, Settings, then remove the variable.` }
    if (variable) return { state: 'ok', sentence: `The site's address is ${variable}, from the Worker variable CORE_SITE_ORIGIN.` }
    if (setting) return { state: 'ok', sentence: `The site's address is ${setting}.` }
    const here = normaliseOrigin(requestOrigin)
    return {
      state: 'warning',
      sentence: "The site's address has not been recorded, so links in emails sent by background work cannot be built, and other addresses are not redirected.",
      remedy: here
        ? `Under Site administration, Settings, set "The site's address" to ${here} if that is the address people use, and confirm the change.`
        : 'Under Site administration, Settings, set "The site\'s address" to the address people use, and confirm the change.',
    }
  },
} satisfies HealthCheck
