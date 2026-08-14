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
        base: 'table-fixed border-separate border-spacing-0',
        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
        tbody: '[&>tr]:last:[&>td]:border-b-0',
        th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
        td: 'border-b border-default',
      },
    },
  },
})
