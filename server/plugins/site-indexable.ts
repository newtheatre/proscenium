import { siteIndexable } from '#shared/utils/seo'

// Decided per request from the resolved site URL: NUXT_PUBLIC_SITE_URL is a runtime variable on a
// duplicate host, and a value fixed at build time would never see it (K-125).
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('site-config:init', ({ siteConfig }) => {
    siteConfig.push({
      _context: 'seo:indexable',
      indexable: siteIndexable(siteConfig.get().url, import.meta.dev),
    })
  })
})
