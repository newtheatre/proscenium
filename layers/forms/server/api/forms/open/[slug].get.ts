// A form as the person about to answer it sees it (FB-302): its questions if it can be answered
// now, and otherwise only why not and what would let them through. A signed-in person gets their
// unsent working copy back, on any device (FB-303).
import { getRouterParam } from 'h3'
import { defineRoute, nowMs, refuse, today } from '#kit'
import { getFormBySlug, getVersion } from '../../../forms'
import { REASONS, draftOf, getLink, shut } from '../../../responses'
import type { Definition } from '../../../../shared/engine'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event, { actor }) => {
  const form = await getFormBySlug(getRouterParam(event, 'slug'))
  const link = form ? await getLink(form.id) : null
  const version = form ? await getVersion(form.liveVersionId) : null
  // A form with no link, or never published, is not there at all as far as the public is concerned.
  if (!form || !link || !version || form.status === 'draft' || form.status === 'archived') return refuse('forms.form.not-found', 'There is no form here.', { status: 404 })

  const head = { formId: form.id, slug: form.slug, title: form.title, anonymous: form.anonymous, signedIn: !!actor.accountId, opensAt: link.opensAt, closesAt: link.closesAt }
  const why = await shut(form, link, actor, nowMs())
  if (why) return { ...head, state: why, ...REASONS[why], definition: null, draft: null, today: null, asksEmail: false }

  const draft = await draftOf(link, actor)
  return {
    ...head,
    state: 'open' as const,
    definition: JSON.parse(version.definition) as Definition,
    today: await today(),
    // Somebody not signed in says who they are by an address, unless the form keeps nobody's name.
    asksEmail: !form.anonymous && !actor.accountId,
    draft: draft ? { responseId: draft.response.id, answers: draft.answers, pageId: draft.pageId } : null,
  }
})
