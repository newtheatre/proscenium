// The id of the label of the form field a control sits in. A date control is a group of parts, which
// a label's `for` cannot name, so the kit's date fields point the group at the label themselves.
import type { Ref } from 'vue'
import { formFieldInjectionKey } from '@nuxt/ui/composables/useFormField'

export function useFieldLabel() {
  const field = inject(formFieldInjectionKey, undefined)
  return computed(() => field?.value?.labelId)
}

/**
 * Names each part of a date control after its field as well, so a screen reader says "On sale from,
 * day" rather than "day". The parts are named by the control itself, so once they are in the page
 * each is pointed at the field's label and at its own name.
 */
export function useFieldPartNames(root: () => HTMLElement | null | undefined, labelledBy: Ref<string | undefined>) {
  const prefix = useId()
  function name() {
    const label = labelledBy.value
    const el = root()
    if (!el || !label) return
    el.querySelectorAll<HTMLElement>('[data-slot="segment"][aria-label]').forEach((part, i) => {
      if (!part.id) part.id = `${prefix}-part-${i}`
      const wanted = `${label} ${part.id}`
      if (part.getAttribute('aria-labelledby') !== wanted) part.setAttribute('aria-labelledby', wanted)
    })
  }
  let observer: MutationObserver | undefined
  onMounted(() => {
    name()
    const el = root()
    if (!el) return
    observer = new MutationObserver(name)
    observer.observe(el, { childList: true, subtree: true })
  })
  watch(labelledBy, name)
  onBeforeUnmount(() => observer?.disconnect())
}
