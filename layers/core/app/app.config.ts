// Central component settings, kept in one place so every screen looks the same. Status colours are
// fixed and never follow the brand: a red brand cannot make a healthy screen look broken. A theatre's
// palette will come from its branding settings.
export default defineAppConfig({
  ui: {
    colors: { primary: 'blue', neutral: 'zinc', success: 'green', warning: 'amber', error: 'red', info: 'sky' },
    // Form controls fill their field, as in Mailflare. Pass a width (w-48, flex-1) to size one differently.
    input: { slots: { root: 'w-full' } },
    textarea: { slots: { root: 'w-full' } },
    inputNumber: { slots: { root: 'w-full' } },
    inputTags: { slots: { root: 'w-full' } },
    select: { slots: { base: 'w-full' } },
    selectMenu: { slots: { base: 'w-full' } },
    inputDate: { slots: { base: 'w-full' } },
    inputTime: { slots: { base: 'w-full' } },
    // Tables carry their own frame, so a page needs no wrapping card.
    table: { slots: { root: 'rounded-lg border border-default', thead: 'bg-elevated/50' } },
    // Dialogue actions sit on the right, so a footer takes its buttons directly.
    modal: { slots: { footer: 'justify-end gap-2' } },
    // Alerts and badges are subtle unless one asks otherwise.
    alert: { defaultVariants: { variant: 'subtle' } },
    badge: { defaultVariants: { variant: 'subtle' } },
    empty: { slots: { root: 'py-12' } },
  },
})
