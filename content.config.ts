import { defineCollection, defineContentConfig } from '@nuxt/content'
import { z } from 'zod'

export default defineContentConfig({
  collections: {
    // One page collection for every markdown-backed public route (D-103, J-110). `docs/` is
    // excluded: operator documentation, signed-in only, is the separate collection below (J-109).
    content: defineCollection({
      type: 'page',
      source: { include: '**/*.md', exclude: ['docs/**'] },
      schema: z.object({
        // Set while the committee has not yet supplied the real copy (D-103). The page renders
        // its content-editor's placeholder banner while this is true.
        placeholder: z.boolean().default(false),
      }),
    }),
    // Operator documentation, one page per module (J-109). Edited by editing the file and
    // merging, the same interim pipeline 0051 established: no in-app editor exists yet.
    docs: defineCollection({
      type: 'page',
      source: 'docs/**/*.md',
      schema: z.object({
        module: z.string(),
        // Set by whoever edits the page, since there is no in-app editor to stamp this
        // automatically (0051). ISO date, read as a plain string rather than parsed.
        updatedOn: z.string(),
        updatedBy: z.string(),
      }),
    }),
  },
})
