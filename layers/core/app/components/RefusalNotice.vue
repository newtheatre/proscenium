<!-- A refusal as the server wrote it: what happened and what to do next. A refusal that a setting
     puts right says where that setting is to those who may change it, and to ask an admin otherwise.
     One that two-step sign-in would put right links to where the person sets it up. -->
<script setup lang="ts">
import type { Refusal } from '../utils/identity'

const props = defineProps<{ refusal: Refusal | null }>()
const { t } = useT()
const { $api } = useNuxtApp()

// Refusals a setting puts right: the setting, and the page it is on.
const SETTLED_BY: Record<string, { key: string, page: string, to: string, labelKey: string, askKey: string }> = {
  'core.locale.time-zone-unset': {
    key: 'core.locale.time-zone',
    page: 'core.theatre',
    to: '/admin/theatre?setting=core.locale.time-zone',
    labelKey: 'core.refusal.time-zone-unset.action',
    askKey: 'core.refusal.time-zone-unset.ask',
  },
}
const settledBy = computed(() => props.refusal ? SETTLED_BY[props.refusal.code] : undefined)
// Whether this viewer may change that setting: the page's own answer, so the link is never a dead end.
const canChange = ref<boolean | null>(null)
watch(settledBy, async (setting) => {
  canChange.value = null
  if (!setting) return
  try {
    const answer = await $api<{ settings: { key: string, canChange: boolean }[] }>('/api/core/settings', { query: { page: setting.page } })
    canChange.value = answer.settings.some(s => s.key === setting.key && s.canChange)
  }
  catch {
    canChange.value = false
  }
}, { immediate: true })
const description = computed(() => settledBy.value && canChange.value === false ? t(settledBy.value.askKey) : props.refusal?.remedy)
const go = computed(() => settledBy.value && canChange.value ? { label: t(settledBy.value.labelKey), to: settledBy.value.to } : refusalAction(props.refusal))
</script>

<template>
  <UAlert
    v-if="refusal"
    role="alert"
    color="error"
    icon="i-lucide-circle-alert"
    :title="refusal.reason"
    :description="description"
    :actions="go ? [{ label: go.label, to: go.to, color: 'neutral', variant: 'outline', trailingIcon: 'i-lucide-arrow-right' }] : undefined"
  />
</template>
