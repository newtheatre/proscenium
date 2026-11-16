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
    // A select's placeholder is readable text (a filter shows its name there), so it meets 4.5:1.
    select: { slots: { base: 'w-full', placeholder: 'text-muted' } },
    selectMenu: { slots: { base: 'w-full' } },
    inputDate: { slots: { base: 'w-full' } },
    inputTime: { slots: { base: 'w-full' } },
    // Tables carry their own frame, so a page needs no wrapping card.
    table: { slots: { root: 'rounded-lg border border-default', thead: 'bg-elevated/50' } },
    // Dialogue actions sit on the right, so a footer takes its buttons directly.
    modal: { slots: { footer: 'justify-end gap-2' } },
    slideover: { slots: { footer: 'justify-end gap-2' } },
    // Alerts and badges are subtle unless one asks otherwise.
    alert: { defaultVariants: { variant: 'subtle' } },
    badge: { defaultVariants: { variant: 'subtle' } },
    empty: { slots: { root: 'py-12' } },
    // A filled button under the pointer keeps 4.5:1: Nuxt UI's 75% tint of the fill drops below it.
    button: {
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'hover:bg-primary/90 active:bg-primary/90' },
        { color: 'secondary', variant: 'solid', class: 'hover:bg-secondary/90 active:bg-secondary/90' },
        { color: 'success', variant: 'solid', class: 'hover:bg-success/90 active:bg-success/90' },
        { color: 'info', variant: 'solid', class: 'hover:bg-info/90 active:bg-info/90' },
        { color: 'warning', variant: 'solid', class: 'hover:bg-warning/90 active:bg-warning/90' },
        { color: 'error', variant: 'solid', class: 'hover:bg-error/90 active:bg-error/90' },
      ],
    },
  },
})
