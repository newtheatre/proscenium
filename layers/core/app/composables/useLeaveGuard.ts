// Leaving with unsaved changes asks once (UI-04): going to another page, closing or reloading the
// browser tab and, when `query` names them, changing those parts of the address (a record page's
// `tab`), which unmount the form as surely as leaving does. Answering "Leave" runs `discard`, so a
// form whose state outlives the tab it sits on starts clean the next time it is shown.
import type { RouteLocationNormalized } from 'vue-router'

export interface LeaveGuardOptions {
  /** Address query keys whose change also leaves the form, such as `['tab']`. */
  query?: string[]
  /** What the dialog names: "this page" by default, "this tab" for a tab. */
  thing?: string
  /** Called once the person agrees to leave, to put the form back as it was. */
  discard?: () => void
}

export function useLeaveGuard(dirty: MaybeRefOrGetter<boolean>, options: LeaveGuardOptions = {}) {
  const { confirm } = useConfirm()
  const { t } = useT()

  async function ask(): Promise<boolean> {
    if (!toValue(dirty)) return true
    const leave = await confirm({ verb: t('core.form.leave'), thing: options.thing ?? t('core.form.leave-thing'), consequence: t('core.form.leave-consequence') })
    if (leave) options.discard?.()
    return leave
  }

  const leaves = (to: RouteLocationNormalized, from: RouteLocationNormalized) =>
    to.path !== from.path || (options.query ?? []).some(key => String(to.query[key] ?? '') !== String(from.query[key] ?? ''))
  onBeforeRouteLeave(() => ask())
  onBeforeRouteUpdate((to, from) => (leaves(to, from) ? ask() : true))

  function beforeUnload(event: BeforeUnloadEvent) {
    if (toValue(dirty)) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

  return { ask }
}
