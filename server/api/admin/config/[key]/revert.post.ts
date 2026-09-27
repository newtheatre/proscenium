import { z } from 'zod'
import { requireBlastRadiusConfirmation } from '#server/utils/blast-radius'
import { priorConfigValue, refuseSynced, writeConfigValue } from '#server/utils/config-write'
import { isConfigKey } from '#shared/utils/config'

// No body at all is the ordinary revert; only a flagged key needs the echo (J-105 criterion 6).
const body = z.object({ confirmation: z.string().trim().optional() }).optional()

// One action, one audited write: reads the value this key stood at immediately before its own
// last change, and writes that back through the same path a save uses (J-105 criterion 3).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'config.write')
  const key = getRouterParam(event, 'key') ?? ''

  if (!isConfigKey(key)) {
    throw noSuch('setting')
  }
  refuseSynced(key)

  const input = await readValidatedBodyOrThrow(event, body)
  const prior = await priorConfigValue(key)
  if (!prior) {
    throw createError({ statusCode: 409, statusMessage: 'This setting has no prior value on the trail to revert to' })
  }
  await requireBlastRadiusConfirmation(event, key, input?.confirmation)

  await writeConfigValue(event, resolved.account.id, key, prior.value)
  return { ok: true, key, value: prior.value }
})
