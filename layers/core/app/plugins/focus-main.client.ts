// After a navigation to another page, focus moves to the page's main content, so a keyboard or
// screen-reader user starts at the new page rather than on the link they pressed. A change of
// query alone (a list's filters, sort or page) is the same page and keeps focus where it is.
export default defineNuxtPlugin(() => {
  useRouter().afterEach(async (to, from) => {
    if (to.path === from.path) return
    await nextTick()
    document.getElementById('main')?.focus({ preventScroll: true })
  })
})
