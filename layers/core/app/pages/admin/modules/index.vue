<!-- Modules (foundations part 7; interface W9), the catalogue: every module the installation has, as
     cards with what it does, whether it is on and a toggle for whoever may switch it. Switching asks
     first, in ModuleSwitchDialog. A module that is on opens on its own page, whose tabs hold its
     settings and About. Administrators with health.view see the page; only the owner switches. -->
<script setup lang="ts">
import type { ModuleView } from '../../../utils/modules'

const { t } = useT()
const { nameOf, pageNameOf, pageDescriptionOf, listOf, keptOnBy, needsOf } = useModuleWords()
const { data, status, error, refresh } = await useAPI<{ modules: ModuleView[], manage: boolean }>('/api/core/modules', { key: 'core:modules' })
const { toggle, refusal, busy } = useModuleSwitch(() => data.value?.modules ?? [])

const byName = (a: ModuleView, b: ModuleView) => a.id === 'core' ? -1 : b.id === 'core' ? 1 : pageNameOf(a.id).localeCompare(pageNameOf(b.id))
// Grouped as the list beside a module's page is: what is on, what could be, and what cannot be switched.
const SEARCH_OVER = 20 // not-policy: a catalogue this long gets its search box back
const search = ref('')
const groups = computed(() => {
  const words = search.value.trim().toLocaleLowerCase('en-GB')
  const all = [...(data.value?.modules ?? [])]
    .filter(m => !words || `${pageNameOf(m.id)} ${nameOf(m.id)} ${pageDescriptionOf(m.id) ?? ''}`.toLocaleLowerCase('en-GB').includes(words))
    .sort(byName)
  return [
    { id: 'on', label: t('core.modules.group.on'), modules: all.filter(m => m.on && !m.alwaysOn) },
    { id: 'off', label: t('core.modules.group.available'), modules: all.filter(m => !m.on && !m.alwaysOn) },
    { id: 'always', label: t('core.modules.group.always-on'), modules: all.filter(m => m.alwaysOn) },
  ].filter(g => g.modules.length)
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
      <UInput
        v-if="(data?.modules.length ?? 0) > SEARCH_OVER"
        v-model="search"
        icon="i-lucide-search"
        :placeholder="t('core.modules.search')"
        :aria-label="t('core.modules.search')"
        class="sm:w-56"
      />
      <EmptyState
        v-if="!groups.length"
        icon="i-lucide-blocks"
        :title="t('core.modules.empty')"
      />
      <section
        v-for="group in groups"
        :key="group.id"
        :aria-labelledby="`modules-${group.id}`"
        class="space-y-3"
      >
        <h2
          :id="`modules-${group.id}`"
          class="text-sm font-semibold text-highlighted"
        >
          {{ group.label }}
        </h2>
        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="m in group.modules"
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
                    <h3 class="font-medium text-highlighted">
                      <ULink
                        v-if="m.open"
                        :to="m.open"
                        class="text-highlighted hover:underline"
                      >
                        {{ pageNameOf(m.id) }}
                      </ULink>
                      <template v-else>
                        {{ pageNameOf(m.id) }}
                      </template>
                    </h3>
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
                <USwitch
                  v-if="data?.manage && !m.alwaysOn"
                  :model-value="m.on"
                  :loading="busy === m.id"
                  :disabled="busy !== null && busy !== m.id"
                  :aria-label="t('core.modules.toggle', { module: nameOf(m.id) })"
                  @update:model-value="toggle(m)"
                />
              </div>
              <div class="flex-1">
                <p
                  v-if="pageDescriptionOf(m.id)"
                  class="line-clamp-3 text-sm text-muted"
                >
                  {{ pageDescriptionOf(m.id) }}
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
                  :aria-label="t('core.modules.open-module', { module: pageNameOf(m.id) })"
                  trailing-icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                />
              </div>
            </UCard>
          </li>
        </ul>
      </section>
    </DataBoundary>
  </PageFrame>
</template>
