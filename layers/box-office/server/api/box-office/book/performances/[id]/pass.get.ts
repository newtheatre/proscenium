// A pass code tried on the Choose tickets page (BO-64): the pass it belongs to, so its entry shows
// before anything is held; or which of unknown, not for this show, already used, used up, not paid
// for or in someone else's name it is. Guessing is slowed by the public form's rate limit.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, useContext } from '#kit'
import { judgePass } from '../../../../../pass-entries'
import { normalisePassCode, shownPassCode } from '../../../../../pass-holding'

export default defineRoute({
  public: true,
  rateLimit: 'public-form',
  input: z.object({ code: z.string().trim().min(1).max(40) }), // not-policy: longer than any code
}, async (event, { input }) => {
  const judged = await judgePass(input.code, getRouterParam(event, 'id', { decode: true })!, { channel: 'online', account: useContext().actor.accountId ?? null })
  return { code: shownPassCode(normalisePassCode(input.code)), name: judged.name, priceName: judged.priceName, owedMinor: judged.owedMinor, left: judged.left }
})
