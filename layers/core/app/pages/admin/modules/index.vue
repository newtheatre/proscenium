<!-- Modules (foundations part 7; interface W9), the catalogue: every module the installation has, as
     cards with what it does, whether it is on and a toggle for whoever may switch it. Switching asks
     first, in ModuleSwitchDialog. A module that is on opens on its own page, whose tabs hold its
     settings and About. Administrators with health.view see the page; only the owner switches. -->
<script setup lang="ts">
import type { ModuleView } from '../../../utils/modules'

const { t } = useT()
const { nameOf, descriptionOf, listOf, keptOnBy, needsOf } = useModuleWords()
const { data, status, error, refresh } = await useAPI<{ modules: ModuleView[], manage: boolean }>('/api/core/modules', { key: 'core:modules' })
const { toggle, refusal, busy } = useModuleSwitch(() => data.value?.modules ?? [])

const filter = ref<'all' | 'on' | 'off'>('all')
const search = ref('')
const filters = computed(() => [
  { label: t('core.modules.filter.all'), value: 'all' },
  { label: t('core.modules.filter.on'), value: 'on' },
  { label: t('core.modules.filter.off'), value: 'off' },
])

const byName = (a: ModuleView, b: ModuleView) => a.id === 'core' ? -1 : b.id === 'core' ? 1 : nameOf(a.id).localeCompare(nameOf(b.id))
const shown = computed(() => {
  const words = search.value.trim().toLocaleLowerCase('en-GB')
  return [...(data.value?.modules ?? [])]
    .filter(m => filter.value === 'all' || (filter.value === 'on') === (m.on || m.alwaysOn))
    .filter(m => !words || `${nameOf(m.id)} ${descriptionOf(m.id) ?? ''}`.toLocaleLowerCase('en-GB').includes(words))
    .sort(byName)
})

const missing = (m: ModuleView) => m.on
  ? [...m.missingSecrets.map(name => t('core.modules.missing-secret', { name })), ...m.credentials.filter(c => c.needed === 'always' && !c.set).map(c => t('core.modules.missing-credential', { name: c.name }))]
  : []
const modules = computed(() => data.value?.modules ?? [])
// Every card says what it needs, those needs' own needs included, and while it is on what keeps it on.
const needs = (m: ModuleView) => {
  const ids = needsOf(m, modules.value)
  return ids.length ? t('core.modules.needs', { modules: listOf(ids.map(nameOf)) }) : ''
}
const lockedBy = (m: ModuleView) => keptOnBy(m, modules.value)
const lockedWhy = (m: ModuleView) => {
  const ids = lockedBy(m)
  return t('core.modules.locked', { modules: listOf(ids.map(nameOf)), those: t('core.modules.locked-those', { count: ids.length }) })
}
const footnote = (m: ModuleView) => m.settings ? t('core.modules.settings-count', { count: m.settings }) : ''
</script>

<template>
  <PageFrame
    :title="t('core.modules.title')"
    width="standard"
  >
    <p class="text-sm text-muted">
      {{ t('core.modules.description') }}
    </p>
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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UTabs
          v-model="filter"
          :items="filters"
          :content="false"
          variant="link"
          class="w-fit"
        />
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('core.modules.search')"
          :aria-label="t('core.modules.search')"
          class="sm:w-56"
        />
      </div>
      <EmptyState
        v-if="!shown.length"
        icon="i-lucide-blocks"
        :title="t('core.modules.empty')"
      />
      <ul
        v-else
        class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <li
          v-for="m in shown"
          :key="m.id"
        >
          <UCard
            class="h-full"
            :ui="{ root: 'flex h-full flex-col', body: 'flex flex-1 flex-col gap-3' }"
          >
            <div class="flex items-start gap-3">
              <div class="rounded-md bg-elevated p-2">
                <UIcon
                  :name="m.icon"
                  class="size-5"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-medium text-highlighted">
                    {{ nameOf(m.id) }}
                  </h2>
                  <UBadge
                    v-if="m.owner === 'site'"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :label="t('core.modules.own')"
                  />
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-2">
                  <UBadge
                    v-if="m.alwaysOn"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-lock"
                    class="pointer-events-none"
                    :label="t('core.modules.state.always-on')"
                  />
                  <span
                    v-else
                    class="text-sm text-muted"
                  >{{ t(m.on ? 'core.modules.state.on' : 'core.modules.state.off') }}</span>
                  <UBadge
                    v-if="m.stability === 'deprecated'"
                    color="warning"
                    variant="outline"
                    size="sm"
                    :label="t(`core.modules.stability.${m.stability}`)"
                  />
                </div>
              </div>
              <UTooltip
                v-if="data?.manage && !m.alwaysOn"
                :text="lockedBy(m).length ? lockedWhy(m) : undefined"
                :disabled="!lockedBy(m).length"
              >
                <span class="inline-flex">
                  <USwitch
                    :model-value="m.on"
                    :loading="busy === m.id"
                    :disabled="(busy !== null && busy !== m.id) || lockedBy(m).length > 0"
                    :aria-label="t('core.modules.toggle', { module: nameOf(m.id) })"
                    @update:model-value="toggle(m)"
                  />
                </span>
              </UTooltip>
            </div>
            <div class="flex-1">
              <p
                v-if="descriptionOf(m.id)"
                class="line-clamp-3 text-sm text-muted"
              >
                {{ descriptionOf(m.id) }}
              </p>
            </div>
            <UAlert
              v-for="line in missing(m)"
              :key="line"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :description="line"
            />
            <p
              v-if="needs(m)"
              class="text-sm text-muted"
            >
              {{ needs(m) }}
            </p>
            <p
              v-if="lockedBy(m).length"
              class="text-sm text-muted"
            >
              {{ t('core.modules.needed-by', { modules: listOf(lockedBy(m).map(nameOf)) }) }}
            </p>
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="text-muted">{{ footnote(m) }}</span>
              <UButton
                v-if="m.open"
                :to="m.open"
                :label="t('core.modules.open')"
                :aria-label="t('core.modules.open-module', { module: nameOf(m.id) })"
                trailing-icon="i-lucide-chevron-right"
                color="neutral"
                variant="ghost"
                size="sm"
              />
            </div>
          </UCard>
        </li>
      </ul>
    </DataBoundary>
  </PageFrame>
</template>
