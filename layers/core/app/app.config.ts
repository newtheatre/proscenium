// Nuxt UI's defaults for every shell. A theatre's palette will come from its branding settings.
export default defineAppConfig({
  ui: {
    colors: { primary: 'blue', neutral: 'zinc' },
    // Form controls fill their field, as in Mailflare.
    input: { slots: { root: 'w-full' } },
    textarea: { slots: { root: 'w-full' } },
    select: { slots: { base: 'w-full' } },
    selectMenu: { slots: { base: 'w-full' } },
  },
})
