export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      secondary: 'orange',
      neutral: 'neutral',
    },
    /**
     * The admin table look: a theme, not a per-page decision (ADR-0012). UTable
     * merges this under any `:ui` a page passes.
     */
    table: {
      slots: {
        /**
         * `min-w-0` so the table can be narrower than its content: as a flex child it
         * otherwise refuses to shrink and pushes the panel sideways.
         */
        root: 'min-w-0',
        /**
         * Note what is *not* here: `table-fixed`. Fixed layout divides width evenly
         * regardless of content, and these cells are `whitespace-nowrap`.
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
