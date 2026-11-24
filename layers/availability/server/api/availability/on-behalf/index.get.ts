// What this planner has added for one person, today onwards (rule A8), with the dates and step the form needs.
import { getQuery } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { entryDates } from '../../../entries'
import { personQuery } from '../../../inputs'
import { addedFor } from '../../../on-behalf'

export default defineRoute({ ability: 'availability.entry.on-behalf', rateLimit: 'default' }, async (event, { actor }) => {
  const parsed = personQuery.safeParse(getQuery(event))
  if (!parsed.success) refuse('availability.person', 'Say whose entries to show.', { status: 422 })
  return { ...await entryDates(), step: Number(await useSetting('availability.grid.step')), entries: await addedFor(actor, parsed.data.accountId) }
})
