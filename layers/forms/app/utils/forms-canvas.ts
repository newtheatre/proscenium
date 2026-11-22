// What the canvas shares with its lists and cards while something is dragged.
import type { InjectionKey, Ref } from 'vue'
import type { Item } from '../../shared/engine'

export const FORMS_CANVAS: InjectionKey<{ board: Ref<Record<string, Item[]>>, dragging: Ref<{ id: string, type: string } | null> }> = Symbol('forms.canvas')

// The two ends of a form on the canvas: what is read before the first page and after sending.
export const FORMS_START = 'form:start'
export const FORMS_END = 'form:end'

// Puts the cursor in the details' first field, so a new item's wording is typed straight away.
// The palette holds focus until it has closed, hence the tries.
export function formsFocusDetails() {
  let tries = 0
  const attempt = () => {
    const field = [...document.querySelectorAll<HTMLElement>('[data-forms-details] :is(textarea, input)')].find(el => el.offsetParent !== null)
    field?.focus()
    if (document.activeElement !== field && ++tries < 12) setTimeout(attempt, 50) // not-policy: milliseconds between tries
  }
  setTimeout(attempt, 50) // not-policy: after the menu's own click handling
}
