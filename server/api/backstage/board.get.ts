import { z } from 'zod'

const querySchema = z.object({ since: z.coerce.number().int().min(0).optional() })

/**
 * GET /api/backstage/board — everything the backstage display shows. Zero
 * personal data crosses this line, by construction (docs/11 §5.2).
 */
export default defineEventHandler(async (event) => {
  const session = await requireBackstageSession(event)
  const { since } = await getValidatedQuery(event, querySchema.parse)

  const [messages, presets, house] = await Promise.all([
    messagesSince(session.nightId, since),
    listPresets('BACKSTAGE'),
    houseCountFor(session.night),
  ])

  return {
    night: session.night,
    deviceName: session.deviceName,
    messages,
    presets,
    house,
    serverTime: Date.now(),
  }
})
