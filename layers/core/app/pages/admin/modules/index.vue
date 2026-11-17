<!-- Modules (foundations part 7; interface W9): every module the installation has, grouped as Always
     on, On, Available and Your theatre's own (x- modules). Each shows its name, what it does, its
     stability, whether it is on and what it needs. Switching asks first, in ModuleSwitchDialog: on
     lists what else switches on, its secrets and the screens that appear; off lists what goes, that
     the data is kept, and what prevents it. A module that is on but missing a secret or credential
     it always needs says so. Administrators with health.view see the page; only the owner switches. -->
<script setup lang="ts">
import type { ModuleView } from '../../../utils/modules'

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const overlay = useOverlay()
const { nameOf, descriptionOf, listOf } = useModuleWords()
const { data, status, error, refresh } = await useAPI<{ modules: ModuleView[], manage: boolean }>('/api/core/modules', { key: 'core:modules' })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref<string | null>(null)

const byName = (a: ModuleView, b: ModuleView) => a.id === 'core' ? -1 : b.id === 'core' ? 1 : nameOf(a.id).localeCompare(nameOf(b.id))
const groups = computed(() => {
  const all = [...(data.value?.modules ?? [])].sort(byName)
  const own = all.filter(m => m.owner === 'site')
  const theirs = all.filter(m => m.owner !== 'site')
  return [
    { id: 'always-on', title: t('core.modules.group.always-on'), help: t('core.modules.group.always-on-help'), modules: theirs.filter(m => m.alwaysOn) },
    { id: 'on', title: t('core.modules.group.on'), help: undefined, modules: theirs.filter(m => !m.alwaysOn && m.on) },
    { id: 'available', title: t('core.modules.group.available'), help: t('core.modules.group.available-help'), modules: theirs.filter(m => !m.alwaysOn && !m.on) },
    { id: 'own', title: t('core.modules.group.own'), help: t('core.modules.group.own-help'), modules: own },
  ].filter(g => g.modules.length)
})

const state = (m: ModuleView) => m.alwaysOn
  ? { tone: 'info' as const, label: t('core.modules.state.always-on') }
  : m.on ? { tone: 'success' as const, label: t('core.modules.state.on') } : { tone: 'neutral' as const, label: t('core.modules.state.off') }
const missingCredentials = (m: ModuleView) => m.credentials.filter(c => c.needed === 'always' && !c.set)

async function toggle(m: ModuleView) {
  const on = !m.on
  const { default: component } = await import('../../../components/ModuleSwitchDialog.vue')
  const dialog = overlay.create(component, { destroyOnClose: true })
  if ((await dialog.open({ module: m, on, modules: data.value?.modules ?? [] }).result) !== true) return
  refusal.value = null
  busy.value = m.id
  try {
    const result = await $api<{ switched: string[] }>(`/api/core/modules/${encodeURIComponent(m.id)}` as '/api/core/modules/:id', { method: 'PUT', body: { on, withRequired: on && m.alsoOn.length > 0 } })
    const others = result.switched.filter(id => id !== m.id).map(nameOf)
    toast.add({
      title: on
        ? (others.length ? t('core.modules.switched-on-with', { module: nameOf(m.id), others: listOf(others) }) : t('core.modules.switched-on', { module: nameOf(m.id) }))
        : t('core.modules.switched-off', { module: nameOf(m.id) }),
      color: 'success',
    })
    // The menus of every shell change with the modules that are on.
    await refreshNuxtData()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.modules.title')"
    :description="t('core.modules.description')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <UAlert
        v-if="data && !data.manage"
        color="info"
        variant="subtle"
        icon="i-lucide-eye"
        :description="t('core.modules.view-only')"
      />
      <RefusalNotice :refusal="refusal" />
      <EmptyState
        v-if="!groups.length"
        icon="i-lucide-blocks"
        :title="t('core.modules.empty')"
      />
      <PageSection
        v-for="group in groups"
        :key="group.id"
        :title="group.title"
        :description="group.help"
      >
        <ul class="divide-y divide-default -my-4">
          <li
            v-for="m in group.modules"
            :key="m.id"
            class="py-4 space-y-2"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-medium text-highlighted">
                    {{ nameOf(m.id) }}
                  </h3>
                  <StatusBadge
                    :tone="state(m).tone"
                    :label="state(m).label"
                  />
                  <UBadge
                    v-if="m.stability !== 'stable'"
                    :color="m.stability === 'deprecated' ? 'warning' : 'neutral'"
                    variant="outline"
                    :label="t(`core.modules.stability.${m.stability}`)"
                  />
                </div>
                <p
                  v-if="descriptionOf(m.id)"
                  class="text-sm text-muted"
                >
                  {{ descriptionOf(m.id) }}
                </p>
                <p
                  v-if="m.requires.length"
                  class="text-sm text-muted"
                >
                  {{ t('core.modules.needs', { modules: listOf(m.requires.map(nameOf)) }) }}
                </p>
                <p
                  v-if="m.on && m.requiredBy.length"
                  class="text-sm text-muted"
                >
                  {{ t('core.modules.needed-by', { modules: listOf(m.requiredBy.map(nameOf)) }) }}
                </p>
              </div>
              <UButton
                v-if="data?.manage && !m.alwaysOn"
                :label="t(m.on ? 'core.modules.switch-off' : 'core.modules.switch-on')"
                :color="m.on ? 'neutral' : undefined"
                :variant="m.on ? 'outline' : 'solid'"
                :loading="busy === m.id"
                :disabled="busy !== null && busy !== m.id"
                @click="toggle(m)"
              />
            </div>
            <template v-if="m.on">
              <UAlert
                v-for="name in m.missingSecrets"
                :key="name"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="t('core.modules.missing-secret', { name })"
              />
              <UAlert
                v-for="c in missingCredentials(m)"
                :key="c.name"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="t('core.modules.missing-credential', { name: c.name })"
              />
            </template>
            <p
              v-if="m.stability === 'deprecated'"
              class="text-sm text-warning"
            >
              {{ t('core.modules.deprecated-note') }}
            </p>
          </li>
        </ul>
      </PageSection>
    </DataBoundary>
  </PageFrame>
</template>
