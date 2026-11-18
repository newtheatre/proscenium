<!-- A country, chosen from the same searchable list the theatre's own country setting uses
     (kit/catalogues.ts), named by the browser in the theatre's language. Holds the two-letter code. -->
<script setup lang="ts">
import { catalogueValues } from '../../kit/catalogues'
import { catalogueLabel } from '../../shared/choices'

defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
const { t } = useT()
const { language } = useDates()
const items = computed(() => catalogueValues('country')
  .map(code => ({ value: code, label: catalogueLabel('country', code, language.value) }))
  .sort((a, b) => a.label.localeCompare(b.label, language.value)))
</script>

<template>
  <USelectMenu
    :model-value="model || undefined"
    :items="items"
    value-key="value"
    :search-input="{ placeholder: t('core.settings-page.search-options') }"
    :placeholder="t('core.settings-page.choose')"
    virtualize
    :disabled="disabled"
    @update:model-value="model = ($event as string | undefined) || null"
  />
</template>
