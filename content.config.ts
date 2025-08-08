import { defineContentConfig, defineCollection, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    footer: defineCollection({
      type: 'data',
      source: 'data/footer.yml',
      schema: z.object({
        socials: z.array(z.object({
          icon: z.string(),
          url: z.string().url(),
        })),
        links: z.array(z.object({
          text: z.string(),
          url: z.string(),
        })),
        legal: z.object({
          copyright: z.string(),
        }),
      }),
    }),
    header: defineCollection({
      type: 'data',
      source: 'data/header.yml',
      schema: z.object({
        links: z.array(z.object({
          text: z.string(),
          url: z.string(),
          button: z.boolean().optional(),
          variant: z.enum(['primary', 'secondary']).optional(),
        })),
      }),
    }),
  },
})
