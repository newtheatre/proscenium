// Open one application (ID-40): what the person asked for, what is in force, and what has happened
// to it. The ability is declared audit: 'read', so every opening is recorded, and nobody opens their
// own. The needs the form offers come too, so the page can name each tick and apply on their behalf;
// for a person who has not applied it answers their name and no application, for that purpose.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, useSetting } from '#kit'
import { accountById, accountLabel } from '../../../../identity/accounts'
import { historyOf, NEEDS_VOCABULARY, openForReview } from '../../../../identity/access-scheme'
import { listTerms } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.access-scheme.read',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const account = await accountById(record!.id)
  if (!account || account.anonymised_at) refuse('core.not-found', 'There is nobody here.', { status: 404 })
  return {
    name: await accountLabel(record!.id),
    application: await openForReview(record!.id),
    history: await historyOf(record!.id),
    needs: (await listTerms(NEEDS_VOCABULARY, { includeRetired: true })).map(t => ({ id: t.id, key: t.slug, label: t.label, description: t.description, retired: t.retired })),
    allowNote: await useSetting('core.access-scheme.allow-note'),
  }
})
