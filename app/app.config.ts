export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      secondary: 'orange',
      neutral: 'neutral',
    },
    /**
     * The admin table look: a rounded, ruled header band over separated rows.
     *
     * This block used to be pasted into the `:ui` prop of every admin table —
     * byte-identical in four pages and subtly different in a fifth, so the shows
     * table had drifted without anyone deciding it should. It is a theme, not a
     * per-page decision, so it lives here. `UTable` merges `appConfig.ui.table`
     * under any `:ui` a page passes, which is how the shows tree table still
     * overrides the three slots it genuinely needs.
     */
    table: {
      slots: {
        /**
         * `min-w-0` so the table can be narrower than its content.
         *
         * UTable's own root is `relative overflow-auto`, which is all a wide
         * table needs — but only if it is allowed to be narrower than its
         * content. As a flex child it defaults to `min-width: auto`, so it
         * refused to shrink, pushed the whole panel wide and scrolled the page
         * sideways instead of scrolling itself.
         */
        root: 'min-w-0',
        /**
         * Note what is *not* here: `table-fixed`.
         *
         * Every admin table used to set it. Fixed layout ignores content and
         * divides the width evenly, so a long email or show title was clipped
         * mid-word while a status column sat half empty — and because cells are
         * `whitespace-nowrap`, clipped is exactly what happened. Auto layout
         * sizes columns to their content and lets the root scroll when the total
         * exceeds the panel, which is also what makes these usable on a phone.
         */
        base: 'border-separate border-spacing-0',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
        td: 'border-b border-default',
      },
    },
  },
})
