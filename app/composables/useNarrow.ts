// Below tablet width, where the calendar drops to a single day (C-102 criterion 5). matchMedia
// rather than a resize listener: the browser already knows, and says so only when it changes.
const TABLET = '(max-width: 767px)'

export function useNarrow(): Ref<boolean> {
  // False during rendering, because a server has no viewport. The week view is the wider guess,
  // and it corrects itself on the first client tick.
  const narrow = ref(false)

  onMounted(() => {
    const query = window.matchMedia(TABLET)
    narrow.value = query.matches

    const answer = (event: MediaQueryListEvent): void => {
      narrow.value = event.matches
    }
    query.addEventListener('change', answer)
    onUnmounted(() => query.removeEventListener('change', answer))
  })

  return narrow
}
