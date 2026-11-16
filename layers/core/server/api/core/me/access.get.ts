// My access application (ID-38, ID-44): its state in plain words, what is in force and what is
// waiting, who may read it and every read by staff. Also the list of needs the form offers.
import { z } from 'zod'
import { defineRoute, useSetting } from '#kit'
import { myApplication, NEEDS_VOCABULARY, readsOfApplication, schemeEnabled, sharingOf } from '../../../identity/access-scheme'
import { listTerms } from '../../../vocabularies/service'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  if (!(await schemeEnabled())) return { enabled: false }
  const accountId = actor.accountId!
  return {
    enabled: true,
    name: await useSetting('core.access-scheme.name'),
    allowNote: await useSetting('core.access-scheme.allow-note'),
    needs: (await listTerms(NEEDS_VOCABULARY)).map(t => ({ id: t.id, key: t.slug, label: t.label })),
    application: await myApplication(accountId),
    sharing: await sharingOf(accountId, actor),
    reads: await readsOfApplication(accountId),
  }
})
