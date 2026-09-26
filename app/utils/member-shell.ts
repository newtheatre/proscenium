// The member shell's widths, named once so a page does not spell its own (0084). A reading page,
// a page that is one form, and the width a grid or a second column needs.
export const MEMBER_PAGE_READING = 'max-w-3xl py-6 sm:py-16'
export const MEMBER_PAGE_WORKING = 'max-w-xl py-6 sm:py-16'
export const MEMBER_PAGE_WIDE = 'max-w-5xl py-6 sm:py-10'

// Every member page's UPageHeader: compact below sm, so a phone opens on the content, and Nuxt
// UI's own sizes above it. The description is never clamped: some carry a phone's instructions (0104).
export const MEMBER_PAGE_HEADER = {
  root: 'py-4 sm:py-8',
  title: 'text-2xl sm:text-4xl',
  description: 'mt-2 sm:mt-4 text-base sm:text-lg',
}
