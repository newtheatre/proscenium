<!-- One form, three views: building it, its responses and its published versions. Each is a page
     of its own, so a view can be linked to; the tabs sit in the same place on all three. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  formId: string
  current: 'build' | 'responses' | 'history'
  /** Left out for somebody who reads the responses and may not edit the form. */
  build?: boolean
  /** Left out for custom fields, which nobody is sent. */
  responses?: boolean
  history?: boolean
}>(), { build: true, responses: true, history: true })
const { t } = useT()
const at = computed(() => `/console/forms/${props.formId}`)
const items = computed(() => [
  ...(props.build ? [{ id: 'build', label: t('forms.screens.tabs.build'), icon: 'i-lucide-pencil-ruler', to: at.value }] : []),
  ...(props.responses ? [{ id: 'responses', label: t('forms.screens.tabs.responses'), icon: 'i-lucide-table-2', to: `${at.value}/responses` }] : []),
  ...(props.history ? [{ id: 'history', label: t('forms.screens.tabs.history'), icon: 'i-lucide-history', to: `${at.value}/versions` }] : []),
].map(item => ({ ...item, active: item.id === props.current })))
</script>

<template>
  <UNavigationMenu
    v-if="items.length > 1"
    :items="items"
    :aria-label="t('forms.screens.tabs.label')"
    highlight
    class="-mx-2.5 shrink-0"
  />
</template>
