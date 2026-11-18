// Switching a module on or off from the catalogue or a module's page: asks first in
// ModuleSwitchDialog, switches (with the modules it needs, when it was shown them), says what
// happened and reloads, because every shell's menu changes with the modules that are on.
import type { ModuleView } from '../utils/modules'

export function useModuleSwitch(modules: () => ModuleView[]) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const overlay = useOverlay()
  const { nameOf, listOf, dependantsOf } = useModuleWords()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const busy = ref<string | null>(null)

  async function toggle(m: ModuleView) {
    const on = !m.on
    const { default: component } = await import('../components/ModuleSwitchDialog.vue')
    const dialog = overlay.create(component, { destroyOnClose: true })
    if ((await dialog.open({ module: m, on, modules: modules() }).result) !== true) return
    refusal.value = null
    busy.value = m.id
    try {
      const put = (id: string, body: { on: boolean, withRequired?: boolean }) => $api<{ switched: string[] }>(`/api/core/modules/${encodeURIComponent(id)}` as '/api/core/modules/:id', { method: 'PUT', body })
      // Switching off a module others need switches those off first, the ones nothing needs before the ones that do.
      const dependants = on ? [] : dependantsOf(m, modules())
      for (const id of dependants) await put(id, { on: false })
      const result = await put(m.id, { on, withRequired: on && m.alsoOn.length > 0 })
      const others = result.switched.filter(id => id !== m.id).map(nameOf)
      toast.add({
        title: on
          ? (others.length ? t('core.modules.switched-on-with', { module: nameOf(m.id), others: listOf(others) }) : t('core.modules.switched-on', { module: nameOf(m.id) }))
          : (dependants.length ? t('core.modules.switched-off-with', { module: nameOf(m.id), others: listOf(dependants.map(nameOf)) }) : t('core.modules.switched-off', { module: nameOf(m.id) })),
        color: 'success',
      })
      await refreshNuxtData()
      const next = on ? modules().find(o => o.id === m.id)?.open : null
      if (next) {
        toast.add({
          title: t('core.modules.set-up-title', { module: nameOf(m.id) }),
          description: t('core.modules.set-up-help'),
          color: 'neutral',
          actions: [{ label: t('core.modules.set-up', { module: nameOf(m.id) }), color: 'neutral', variant: 'outline', onClick: () => { void navigateTo(next) } }],
        })
      }
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
    finally {
      busy.value = null
    }
  }

  return { toggle, refusal, busy }
}
