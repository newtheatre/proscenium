import { z } from 'zod'
import { blastRadiusPreview } from '#server/utils/blast-radius'
import { writeConfigValue } from '#server/utils/config-write'
import { isConfigKey } from '#shared/utils/config'

const body = z.object({ value: z.unknown(), confirmation: z.string().trim().optional() })

// Change one setting. One key per request, so one save is one audited change.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'config.write')
  const key = getRouterParam(event, 'key') ?? ''

  if (!isConfigKey(key)) {
    throw createError({ statusCode: 404, statusMessage: 'No such setting' })
  }

  const input = await readValidatedBodyOrThrow(event, body)

  // A flagged key needs its preview echoed back before the write is attempted at all: the
  // confirmation text is validated, never a checkbox (J-105 criteria 1, 2, 5).
  const flagged = (await configValue(event, 'WIDE_BLAST_RADIUS_KEYS')).includes(key)
  if (flagged) {
    const preview = await blastRadiusPreview(event, key)
    const expected = [key, preview ? String(preview.count) : null].filter((value): value is string => value !== null)
    if (!expected.includes(input.confirmation ?? '')) {
      throw createError({
        statusCode: 400,
        statusMessage: `Type ${expected.map(value => `"${value}"`).join(' or ')} to confirm this change.`,
      })
    }
  }

  await writeConfigValue(event, resolved.account.id, key, input.value)
  return { ok: true, key, value: input.value }
})
