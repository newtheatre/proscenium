// A media query that answers false until the page has hydrated. The server cannot know the width,
// so it draws the false case; answering the same on the browser's first render keeps the two in step
// (a mismatch otherwise on every phone page that chooses markup by width), and the answer follows the
// width from then on. Prefer CSS (`max-sm:hidden`, `lg:hidden`) where both forms can be drawn.
import { useMediaQuery, useMounted } from '@vueuse/core'

export function useScreenQuery(query: MaybeRefOrGetter<string>) {
  const mounted = useMounted()
  const matches = useMediaQuery(query)
  return computed(() => mounted.value && matches.value)
}
