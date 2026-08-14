export default defineAppConfig({
  ui: {
    colors: {
      primary: 'purple',
      secondary: 'orange',
      neutral: 'neutral',
    },
    /**
     * The admin table look: a rounded, ruled header band over separated rows. A
     * theme, not a per-page decision (ADR-0012). `UTable` merges this under any
     * `:ui` a page passes, so a page that genuinely needs an override still can.
     */
    table: {
      slots: {
        /**
         * `min-w-0` so the table can be narrower than its content. UTable's root is
         * already `relative overflow-auto`, but as a flex child it defaults to
         * `min-width: auto` and refuses to shrink — pushing the panel wide and
         * scrolling the page sideways instead of scrolling itself.
         */
        root: 'min-w-0',
        /**
         * Note what is *not* here: `table-fixed`. Fixed layout divides width evenly
         * regardless of content, and since cells are `whitespace-nowrap` a long title
         * or email is clipped mid-word while a status column sits half empty.
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
