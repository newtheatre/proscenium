// Central component settings, kept in one place so every screen looks the same. Status colours are
// fixed and never follow the brand: a red brand cannot make a healthy screen look broken. A theatre's
// palette will come from its branding settings.
export default defineAppConfig({
  ui: {
    colors: { primary: 'blue', neutral: 'zinc', success: 'green', warning: 'amber', error: 'red', info: 'sky' },
    // Form controls fill their field, as in Mailflare.
    input: { slots: { root: 'w-full' } },
    textarea: { slots: { root: 'w-full' } },
    select: { slots: { base: 'w-full' } },
    selectMenu: { slots: { base: 'w-full' } },
  },
})
