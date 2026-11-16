// Upstream-owned. Upstream's collections, plus whatever the theatre declares in site/content.config.ts.
import { fileURLToPath } from 'node:url'
import { defineContentConfig, defineCollection, z } from '@nuxt/content'
import theatre from './site/content.config'

export default defineContentConfig({
  collections: {
    pages: defineCollection({ type: 'page', source: { include: '**/*.md', cwd: fileURLToPath(new URL('./site/content/pages', import.meta.url)) } }),
    // The public shell's header and footer links: the theatre's own file, site/content/navigation.yml.
    navigation: defineCollection({
      type: 'data',
      source: { include: 'navigation.yml', cwd: fileURLToPath(new URL('./site/content', import.meta.url)) },
      schema: z.object({
        name: z.string().optional(),
        header: z.array(z.object({ label: z.string(), to: z.string() })).default([]),
        footer: z.array(z.object({ label: z.string(), to: z.string() })).default([]),
        contact: z.string().optional(),
        credit: z.string().optional(),
      }),
    }),
    ...theatre,
  },
})
