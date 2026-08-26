// Merged into Nuxt UI's theme by defu. Apps still override per-app
// (app.config) and per-instance (`:ui` / `class`), so keep additions additive.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      secondary: 'gold',
      neutral: 'ash',
      success: 'emerald',
      info: 'sky',
      warning: 'amber',
      error: 'red',
    },

    button: {
      slots: {
        base: 'font-semibold transition-all',
      },
      variants: {
        variant: {
          // The one CTA that matters on a view. Colour-agnostic: passing
          // `color` alongside it does nothing.
          marquee:
            'bg-inverted text-gold-400 nnt-marquee '
            + 'hover:scale-[1.03] active:scale-[0.98] '
            + 'dark:bg-gold-400 dark:text-ash-950',
          // Hand-printed poster button: flat fill, ink ring, hard offset
          // shadow that the button presses into on click.
          poster:
            'bg-white text-ash-950 ring-2 ring-inset ring-ash-950 '
            + 'nnt-shadow-poster-ink rounded-none '
            + 'hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[0.25rem_0.25rem_0_0_var(--ui-color-neutral-950)] '
            + 'active:translate-x-[6px] active:translate-y-[6px] active:shadow-none '
            + 'dark:nnt-shadow-poster dark:hover:shadow-[0.25rem_0.25rem_0_0_var(--ui-color-secondary-400)]',
        },
      },
    },

    badge: {
      variants: {
        variant: {
          // Tilted sticker: NEW, SOLD OUT, STUFF 2027. One per view.
          sticker:
            'nnt-sticker rounded-full font-display font-extrabold uppercase tracking-wide '
            + 'bg-gold-400 text-ash-950 '
            + 'ring-2 ring-ash-950 dark:ring-ash-100',
        },
      },
    },

    card: {
      variants: {
        variant: {
          // Show poster: square corners, ink ring, hard gold shadow.
          poster: {
            root:
              'rounded-none bg-default ring-2 ring-ash-950 '
              + 'nnt-shadow-poster divide-y divide-ash-950 '
              + 'dark:ring-gold-400',
          },
          // Ticket stub, perforated at the fold. Booking summaries and prices.
          ticket: {
            root: 'nnt-ticket rounded-lg bg-elevated divide-y divide-dashed divide-accented',
          },
        },
      },
    },

    // The admin table look is a theme, not a per-page decision
    // (proscenium ADR-0012). UTable merges any `:ui` a page passes over it.
    table: {
      slots: {
        root: 'min-w-0',
        base: 'border-separate border-spacing-0',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
        td: 'border-b border-default',
      },
    },
  },
})
