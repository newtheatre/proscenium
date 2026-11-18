<!-- A module's About tab: what it needs and what needs it, its version and stability, the Worker
     secrets and credentials it uses (only whether each is set), and the screens it adds. -->
<script setup lang="ts">
import type { ModuleView } from '../utils/modules'

const props = defineProps<{ module: string, view: ModuleView | undefined }>()
const { t } = useT()
const { nameOf, listOf, screensOf } = useModuleWords()
const screens = computed(() => props.view ? screensOf(props.view) : [])
// What it uses, and the modules that add to it (Box office's figures on Front of house's board).
const partners = computed(() => props.view ? [...props.view.uses, ...(props.view.worksWith ?? [])] : [])
const needed = (n: 'always' | 'when-used' | 'optional') => t(`core.modules.about.needed.${n}`)
</script>

<template>
  <EmptyState
    v-if="!view"
    icon="i-lucide-info"
    :title="t('core.modules.about.unavailable')"
  />
  <div
    v-else
    class="space-y-4"
  >
    <PageSection :title="t('core.modules.about.depends')">
      <dl class="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt class="text-muted">
          {{ t('core.modules.about.requires') }}
        </dt>
        <dd>{{ view.requires.length ? listOf(view.requires.map(nameOf)) : module === 'core' ? t('core.modules.about.nothing') : t('core.modules.about.core-only') }}</dd>
        <dt class="text-muted">
          {{ t('core.modules.about.required-by') }}
        </dt>
        <dd>{{ view.requiredBy.length ? listOf(view.requiredBy.map(nameOf)) : t('core.modules.about.nothing') }}</dd>
        <template v-if="partners.length">
          <dt class="text-muted">
            {{ t('core.modules.about.uses') }}
          </dt>
          <dd>{{ listOf(partners.map(nameOf)) }}</dd>
        </template>
        <dt class="text-muted">
          {{ t('core.modules.about.since') }}
        </dt>
        <dd>
          {{ view.since }}<template v-if="view.stability !== 'stable'">
            , {{ t(`core.modules.stability.${view.stability}`).toLocaleLowerCase('en-GB') }}
          </template>
        </dd>
      </dl>
      <p
        v-if="view.stability === 'experimental'"
        class="mt-3 text-sm text-muted"
      >
        {{ t('core.modules.experimental-note') }}
      </p>
      <p
        v-if="view.stability === 'deprecated'"
        class="mt-3 text-sm text-warning"
      >
        {{ t('core.modules.deprecated-note') }}
      </p>
    </PageSection>
    <PageSection
      v-if="view.secrets.length || view.credentials.length"
      :title="t('core.modules.about.secrets')"
      :description="t('core.modules.about.secrets-help')"
    >
      <ul class="space-y-2 text-sm">
        <li
          v-for="s in [...view.secrets, ...view.credentials]"
          :key="s.name"
          class="flex flex-wrap items-center gap-2"
        >
          <UIcon
            :name="s.set ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
            :class="s.set ? 'text-success' : 'text-muted'"
            class="size-4"
          />
          <code>{{ s.name }}</code>
          <span class="text-muted">{{ t(s.set ? 'core.modules.about.set' : 'core.modules.about.unset') }}, {{ needed(s.needed) }}</span>
        </li>
      </ul>
    </PageSection>
    <PageSection :title="t('core.modules.about.screens')">
      <p
        v-if="!screens.length"
        class="text-sm text-muted"
      >
        {{ t('core.modules.dialog.no-screens') }}
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
      >
        <li
          v-for="s in screens"
          :key="s.id"
        >
          {{ s.label }} <span class="text-muted">({{ s.shell }})</span>
        </li>
      </ul>
    </PageSection>
  </div>
</template>
