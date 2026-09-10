import { siteIndexable } from '#shared/utils/seo'

// Below every configured source, so NUXT_PUBLIC_SITE_INDEXABLE and the like still win.
export const INDEXABLE_PRIORITY = -5

// Decided per request from the origin the request actually reached, so a duplicate host is kept
// out of search with no variable to remember (K-125). A dev server always indexes.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('site-config:init', ({ event, siteConfig }) => {
    siteConfig.push({
      _context: 'seo:indexable',
      _priority: INDEXABLE_PRIORITY,
      indexable: siteIndexable(event.context.siteConfigNitroOrigin as string | undefined, import.meta.dev),
    })
  })
})
