import { defineCollection, defineContentConfig } from '@nuxt/content'
import { z } from 'zod'

export default defineContentConfig({
  collections: {
    // One page collection for every markdown-backed route: editorial pages here, policy pages
    // wherever J-110 adds them (D-103). `path()` on this collection is how [...slug].vue finds them.
    content: defineCollection({
      type: 'page',
      source: '**/*.md',
      schema: z.object({
        // Set while the committee has not yet supplied the real copy (D-103). The page renders
        // its content-editor's placeholder banner while this is true.
        placeholder: z.boolean().default(false),
      }),
    }),
  },
})
