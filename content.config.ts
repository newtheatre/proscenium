// Upstream-owned. Upstream's collections, plus whatever the theatre declares in site/content.config.ts.
import { fileURLToPath } from 'node:url'
import { defineContentConfig, defineCollection, z } from '@nuxt/content'
import theatre from './site/content.config'

const site = (path: string) => fileURLToPath(new URL(`./site/content/${path}`, import.meta.url))
const link = z.object({ label: z.string(), to: z.string() })

export default defineContentConfig({
  collections: {
    pages: defineCollection({ type: 'page', source: { include: '**/*.md', cwd: site('pages') } }),
    // The public menu (C-40): one file, site/content/navigation.yml.
    navigation: defineCollection({ type: 'data', source: { include: 'navigation.yml', cwd: site('') }, schema: z.object({ header: z.array(link).default([]), footer: z.array(link).default([]) }) }),
    // Old addresses kept working after a move (C-45): one file, site/content/redirects.yml.
    redirects: defineCollection({ type: 'data', source: { include: 'redirects.yml', cwd: site('') }, schema: z.object({ redirects: z.array(z.object({ from: z.string(), to: z.string() })).default([]) }) }),
    ...theatre,
  },
})
