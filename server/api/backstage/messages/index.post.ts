import { z } from 'zod'

const bodySchema = z.object({
  presetId: z.string().trim().min(1).optional(),
  body: z.string().trim().max(500).optional(),
})

/** POST /api/backstage/messages — send a preset or free text. One of three verbs. */
export default defineEventHandler(async (event) => {
  const session = await requireBackstageSession(event)
  const input = await readValidatedBody(event, bodySchema.parse)

  return sendBoardMessage({
    nightId: session.nightId,
    direction: 'BACKSTAGE',
    presetId: input.presetId,
    body: input.body,
    sender: { sessionId: session.id, name: session.deviceName ?? 'Backstage' },
  })
})
