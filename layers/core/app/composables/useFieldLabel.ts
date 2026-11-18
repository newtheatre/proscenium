// The id of the label of the form field a control sits in. A date control is a group of parts, which
// a label's `for` cannot name, so the kit's date fields point the group at the label themselves.
import { formFieldInjectionKey } from '@nuxt/ui/composables/useFormField'

export function useFieldLabel() {
  const field = inject(formFieldInjectionKey, undefined)
  return computed(() => field?.value?.labelId)
}
