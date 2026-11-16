<!-- Find a setting by searching (UI-15): matches the label and the help text of every setting on
     modules that are on, and opens the one chosen scrolled into view and highlighted. -->
<script setup lang="ts">
import { matchSettings } from '../../shared/search'

const { t } = useT()
const { data } = useSettingsIndex()
const term = ref('')
const MOST_RESULTS = 8 // not-policy: a short list under the box
const hits = computed(() => matchSettings(data.value?.settings ?? [], term.value, t).slice(0, MOST_RESULTS))
</script>

<template>
  <div class="mb-6">
    <UFormField
      :label="t('core.search.settings.label')"
      :help="t('core.search.settings.help')"
    >
      <UInput
        v-model="term"
        type="search"
        icon="i-lucide-search"
        :placeholder="t('core.search.settings.placeholder')"
      />
    </UFormField>
    <p
      class="sr-only"
      role="status"
    >
      {{ term ? t('core.search.results', { count: hits.length }) : '' }}
    </p>
    <ul
      v-if="term && hits.length"
      class="mt-2 divide-y divide-default rounded-lg border border-default"
    >
      <li
        v-for="hit in hits"
        :key="hit.key"
      >
        <NuxtLink
          :to="hit.to"
          class="block px-3 py-2 hover:bg-elevated"
        >
          <span class="block font-medium text-highlighted">{{ hit.label }}</span>
          <span class="block text-sm text-muted">{{ hit.help }}</span>
        </NuxtLink>
      </li>
    </ul>
    <p
      v-else-if="term"
      class="mt-2 text-sm text-muted"
    >
      {{ t('core.search.settings.none', { term }) }}
    </p>
  </div>
</template>
