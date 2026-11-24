// Switch one optional kind of message on or off, by email and in the inbox together (FH-6).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { isMember } from '../../../../interface/viewer'
import { setTopic } from '../../../../notifications/preferences'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ on: z.boolean() }).strict(),
}, async (event, { input, unit, actor }) => {
  const topic = getRouterParam(event, 'topic', { decode: true }) ?? ''
  await setTopic(unit, actor.accountId!, await isMember(actor), topic, input.on)
  return { topic, on: input.on }
})
