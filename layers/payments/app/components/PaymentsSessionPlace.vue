<!-- Where a till session is: one of the theatre's spaces, or "Unknown". Gives the space's id, or null
     for unknown. Used on the till, the Your session card and the default-space setting. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })

const { t } = useT()
const { data } = await useAPI<{ spaces: { id: string, place: string }[] }>('/api/payments/spaces', { key: 'payments:spaces', default: () => ({ spaces: [] }) })
const UNKNOWN = '-'
const items = computed(() => [{ value: UNKNOWN, label: t('payments.screens.session.unknown-place') }, ...(data.value?.spaces ?? []).map(s => ({ value: s.id, label: s.place }))])
// The control's name holds the place it shows, so a screen reader and a voice command agree.
const current = computed(() => items.value.find(i => i.value === (model.value ?? UNKNOWN))?.label ?? '')
</script>

<template>
  <USelectMenu
    :model-value="model ?? UNKNOWN"
    :items="items"
    value-key="value"
    :aria-label="t('payments.screens.session.place-is', { place: current })"
    :search-input="items.length > 8 ? { placeholder: t('payments.screens.session.find-place') } : false"
    :disabled="disabled"
    class="min-w-48"
    @update:model-value="(v: string) => { model = v === UNKNOWN ? null : v }"
  />
</template>
