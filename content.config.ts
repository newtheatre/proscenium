// Upstream-owned. Upstream's collections, plus whatever the theatre declares in site/content.config.ts.
import { defineContentConfig, defineCollection } from '@nuxt/content'
import theatre from './site/content.config'
export default defineContentConfig({
  collections: {
    pages: defineCollection({ type: 'page', source: { include: '**/*.md', cwd: new URL('./site/content/pages', import.meta.url).pathname } }),
    ...theatre,
  },
})
