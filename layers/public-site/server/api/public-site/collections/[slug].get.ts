// A collection's public page (C-60): a published or archived collection and its published productions,
// current first. An old address answers { moved }; an archived one is not found while past shows are private.
import { getRouterParam } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { publicCollection } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const slug = getRouterParam(event, 'slug', { decode: true }) ?? ''
  const collection = await publicCollection(slug, { pastVisible: await useSetting('public-site.archive.public') as boolean })
  if (!collection) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return collection
})
