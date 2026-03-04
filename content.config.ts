import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: '**/*.md',
    }),
    pages: defineCollection({
      type: 'page',
      source: 'pages/**',
      schema: z.object({
        heroImage: z.string().optional(),
        heroImageAlt: z.string().optional(),
      }),
    }),
    stagecraft: defineCollection({
      type: 'page',
      source: 'stagecraft/**',
      schema: z.object({
        title: z.string(),
        date: z.string(),
        time: z.object({
          start: z.string(),
          end: z.string(),
        }),
        location: z.string().default('New Theatre'),
        cancelled: z.boolean().default(false),
        leaders: z.array(z.string()),
        category: z.string(),
        icon: z.string().optional(),
        materials: z.object({
          sessionPlan: z.string().url().optional(),
          supportingMaterials: z.array(z.object({
            title: z.string(),
            url: z.string().url(),
            type: z.enum(['document', 'presentation', 'video', 'folder']).optional(),
          })).optional(),
        }).optional(),
        prerequisites: z.array(z.string()).optional(),
        learning_outcomes: z.array(z.string()).optional(),
      }),
    }),
  },
})
