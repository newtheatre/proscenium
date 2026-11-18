// The till opens the seller's session with their first sale when none is open (selling proposal). It
// opens at the space the device used last, if that still exists, else at
// the space the sale says it is for (tonight's performance's), else payments.sessions.default-space,
// else at the theatre's only space, else at no space ("Unknown"); any of these can be changed later.
// With a session already open, that one is returned and nothing changes.
import { z } from 'zod'
import { defineRoute, isRefusal } from '#kit'
import { defaultSpace, getSession, openSession, sessionOf, summarise } from '../../../sessions'
import { tillSpace } from '../../../till'
import { panels } from './summary.post'

export default defineRoute({
  ability: 'payments.session.open',
  rateLimit: 'write',
  // `panels`: the sale about to be made, which may say where it is.
  input: z.object({ spaceId: z.string().max(40).nullable().optional(), panels: panels.optional() }).strict(), // not-policy: an id's length
}, async (_event, { input, actor, unit }) => {
  const mine = await sessionOf(actor.accountId!)
  if (mine) return { session: await summarise(mine), opened: false }
  const fallback = (input.panels?.length ? await tillSpace(actor, input.panels as { basket: string, input: unknown }[]) : null) ?? await defaultSpace()
  let id: string
  try {
    id = await openSession(unit.view(), { accountId: actor.accountId!, spaceId: input.spaceId ?? fallback })
  }
  catch (error) {
    // The device's space, or the default, has gone since: open at no space rather than not at all.
    if (!isRefusal(error) || error.code !== 'payments.session.no-such-space') throw error
    id = await openSession(unit.view(), { accountId: actor.accountId! })
  }
  await unit.commit()
  return { session: await summarise((await getSession(id))!), opened: true }
})
