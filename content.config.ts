import { defineCollection, defineContentConfig } from '@nuxt/content'
import { z } from 'zod'

export default defineContentConfig({
  collections: {
    // One page collection for every markdown-backed public route (D-103, J-110). `docs/` and
    // `help/` are excluded: each is its own collection below (J-109, 0093).
    content: defineCollection({
      type: 'page',
      source: { include: '**/*.md', exclude: ['docs/**', 'help/**'] },
      schema: z.object({
        // Set while the committee has not yet supplied the real copy (D-103). The page renders
        // its content-editor's placeholder banner while this is true.
        placeholder: z.boolean().default(false),
        // A path under public/ drawn behind the page's title, scrimmed (K-126). A page without
        // one gets the plain hero.
        banner: z.string().optional(),
        // The landing page's furniture, in front matter so the committee edits words rather than
        // a Vue file (J-111). Every field is optional: an ordinary content page carries none.
        headline: z.string().optional(),
        flash: z.string().optional(),
        departments: z.array(z.object({
          title: z.string(),
          icon: z.string(),
          blurb: z.string(),
        })).optional(),
        steps: z.array(z.object({
          title: z.string(),
          blurb: z.string(),
        })).optional(),
        quote: z.string().optional(),
      }),
    }),
    // Operator documentation, one page per screen in a numbered tree (J-109, 0076). Edited by
    // editing the file and merging, the same interim pipeline 0051 established.
    docs: defineCollection({
      type: 'page',
      // `docs/**`, not `*.md`: a folder's `.navigation.yml` has to be in the collection for
      // queryCollectionNavigation to read its title and icon.
      source: 'docs/**',
      schema: z.object({
        module: z.string(),
        // Set by whoever edits the page, since there is no in-app editor to stamp this
        // automatically (0051). ISO date, read as a plain string rather than parsed.
        updatedOn: z.string(),
        updatedBy: z.string(),
        // DOCS_AUDIENCES in shared/utils/docs-audience.ts; the tree reads it, access never does (0093).
        audience: z.enum(['member', 'committee']),
      }),
    }),
    // Public help, read signed out: its own collection so its dump holds nothing but these pages.
    // Never a filter over `docs`, whose dump would then be anonymous too (0093).
    help: defineCollection({
      type: 'page',
      source: 'help/**',
      schema: z.object({
        module: z.string(),
        updatedOn: z.string(),
        updatedBy: z.string(),
        audience: z.literal('public'),
      }),
    }),
  },
})
