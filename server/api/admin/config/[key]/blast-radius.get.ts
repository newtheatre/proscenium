import { z } from 'zod'
import { blastRadiusPreview } from '#server/utils/blast-radius'
import { priorConfigValue } from '#server/utils/config-write'
import { isConfigKey } from '#shared/utils/config'

// `value` is the proposed value as JSON; `revert` previews the value a revert would write back.
const query = z.object({ value: z.string().optional(), revert: z.enum(['true']).optional() })

function parsed(json: string | undefined): unknown {
  if (json === undefined) return undefined
  try {
    return JSON.parse(json)
  }
  catch {
    return undefined
  }
}

// The live count and category a flagged setting's own save screen previews before it may be
// saved (J-105 criterion 1). Read-only: nothing here writes or claims anything.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'config.write')
  const key = getRouterParam(event, 'key') ?? ''

  if (!isConfigKey(key)) {
    throw noSuch('setting')
  }

  const input = await getValidatedQueryOrThrow(event, query)
  const proposed = input.revert ? (await priorConfigValue(key))?.value : parsed(input.value)
  const preview = await blastRadiusPreview(event, key, proposed)
  if (!preview) {
    throw createError({ statusCode: 404, statusMessage: 'This setting has no blast-radius preview' })
  }

  return preview
})
