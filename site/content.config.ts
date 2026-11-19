// Yours. Add your own content collections here; upstream never changes this file.
import { defineCollection, z } from '@nuxt/content'
import { fileURLToPath } from 'node:url'

const site = (path: string) => fileURLToPath(new URL(`./content/${path}`, import.meta.url))
const link = z.object({ label: z.string(), to: z.string() })

export default {
  // The home page's words (site/content/home.yml), drawn by site/app/pages/index.vue.
  home: defineCollection({
    type: 'data',
    source: { include: 'home.yml', cwd: site('') },
    schema: z.object({
      title: z.string(),
      description: z.string(),
      hero: z.object({ headline: z.string().optional(), title: z.string(), highlight: z.string().optional(), description: z.string(), image: z.string().optional(), links: z.array(link).default([]) }),
      whatsOn: z.object({ title: z.string(), limit: z.number().int().positive().default(3), link: link.optional() }),
      feature: z.object({ headline: z.string().optional(), title: z.string(), description: z.string(), link: link.optional() }).optional(),
      involved: z.object({ title: z.string(), highlight: z.string().optional(), description: z.string(), link: link.optional(), items: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string().optional() })).default([]) }).optional(),
    }),
  }),
}
