import { tillScopeForm } from '#shared/utils/till'

// Tonight's hand-offs still waiting, or taken on the reader and not recorded (F-124 criterion 6),
// so the laptop can answer for a phone that left one behind.
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  const resolved = await requireNightAuthority(event, 'BAR', scope)

  return { attempts: await unresolvedAttempts(resolved.night) }
})
