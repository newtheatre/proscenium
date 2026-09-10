import { blastRadiusPreview } from '#server/utils/blast-radius'
import { isConfigKey } from '#shared/utils/config'

// The live count and category a flagged setting's own save screen previews before it may be
// saved (J-105 criterion 1). Read-only: nothing here writes or claims anything.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'config.write')
  const key = getRouterParam(event, 'key') ?? ''

  if (!isConfigKey(key)) {
    throw createError({ statusCode: 404, statusMessage: 'No such setting' })
  }

  const preview = await blastRadiusPreview(event, key)
  if (!preview) {
    throw createError({ statusCode: 404, statusMessage: 'This setting has no blast-radius preview' })
  }

  return preview
})
