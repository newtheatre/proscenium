import { z } from 'zod'
import { queryCollection } from '@nuxt/content/nitro'
import { hasDefault, isConfigKey, isEnforced, isSensitive, CONFIG_KEYS } from '#shared/utils/config'
import { policyValueFor, tokensInTree } from '#shared/utils/policy-tokens'
import type { PolicyValues } from '#shared/utils/policy-tokens'

const query = z.object({
  // A content path, which is the only thing that decides which keys this answers for.
  path: z.string().min(1).max(200).regex(/^\/[a-z0-9\-/]*$/),
})

// The live value of every setting one policy page quotes (J-110, 0012).
export default defineEventHandler(async (event) => {
  const { path } = await getValidatedQueryOrThrow(event, query)

  // Keyed on the page, never on a list of keys from the caller: a request may only read the
  // settings that page already publishes, so this cannot become a way to read the whole surface.
  const page = await queryCollection(event, 'content').path(path).first()
  if (!page) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

  const overrides = await configOverrides(event)
  const values: PolicyValues = {}

  for (const key of tokensInTree(page.body)) {
    const known = isConfigKey(key)
    const resolved = policyValueFor(key, {
      known,
      sensitive: known && isSensitive(key),
      set: known && (overrides.has(key) || hasDefault(key)),
      enforced: known && isEnforced(key),
      value: known
        ? overrides.has(key) ? overrides.get(key) : (CONFIG_KEYS[key] as { default?: unknown }).default
        : undefined,
    })
    if (resolved) values[key] = resolved
  }

  // Never cached: a settings change has to show on the page at the next request, which is the
  // whole point of quoting the live value rather than the prose (0012).
  setResponseHeader(event, 'cache-control', 'no-store')
  return { values }
})
