// One version of a policy, as plain Markdown: the words as they read then. Kept even after the
// module that declared the policy is switched off, since somebody may have agreed to it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { versionText } from '../../../../../policies/versions'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const number = Number(getRouterParam(event, 'number', { decode: true }))
  const found = Number.isInteger(number) && number > 0 ? await versionText(getRouterParam(event, 'id', { decode: true }) ?? '', number) : null
  if (!found) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { policy: found.policy, number: found.number, title: found.title, body: found.body, createdAt: found.createdAt }
})
