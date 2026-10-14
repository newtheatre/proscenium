import { z } from 'zod'

const query = z.object({
  token: z.string().max(200).default(''),
  kind: z.enum(['PASSWORD_RESET', 'SET_PASSWORD']).default('PASSWORD_RESET'),
})

// Whether a reset or set-password link is still good, asked by /reset on arrival (0121). It spends
// nothing and names nobody, so it tells the asker no more than the link itself already proves.
export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, query)
  if (input.token.length < 20) return { usable: false }
  return { usable: await tokenUsable(input.token, input.kind) }
})
