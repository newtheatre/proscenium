<!-- Find a setting by searching (UI-15): matches the label and the help text of every setting on
     modules that are on, and opens the one chosen scrolled into view and highlighted. It is a quiet
     link until asked for, so a page of settings starts with its settings. -->
<script setup lang="ts">
import { matchSettings } from '../../shared/search'

const { t } = useT()
const { data } = useSettingsIndex()
const term = ref('')
const open = ref(false)
const box = useTemplateRef<{ inputRef: HTMLInputElement | null }>('box')
async function show() {
  open.value = true
  await nextTick()
  box.value?.inputRef?.focus()
}
const MOST_RESULTS = 8 // not-policy: a short list under the box
const hits = computed(() => matchSettings(data.value?.settings ?? [], term.value, t).slice(0, MOST_RESULTS))
</script>

<template>
  <UButton
    v-if="!open"
    color="neutral"
    variant="link"
    size="sm"
    icon="i-lucide-search"
    class="-ms-2.5"
    :label="t('core.search.settings.label')"
    @click="show"
  />
  <div
    v-else
    role="search"
  >
    <UFormField
      :label="t('core.search.settings.label')"
      :help="t('core.search.settings.help')"
    >
      <UInput
        ref="box"
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
    <RecordList
      v-if="term && hits.length"
      class="mt-2"
    >
      <RecordListItem
        v-for="hit in hits"
        :key="hit.key"
        :to="hit.to"
        :name="hit.label"
        :description="hit.help"
      />
    </RecordList>
    <p
      v-else-if="term"
      class="mt-2 text-sm text-muted"
    >
      {{ t('core.search.settings.none', { term }) }}
    </p>
  </div>
</template>
