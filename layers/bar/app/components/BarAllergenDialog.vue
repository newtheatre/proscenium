<!-- Checking a label: two sets of the 14 allergens and where the answer came from, posted to the
     subject's allergens endpoint. Recording the same answer again counts as a fresh check. -->
<script setup lang="ts">
const props = defineProps<{
  target: { title: string, endpoint: string, contains: string[], mayContain: string[] } | null
  help: string
}>()
const emit = defineEmits<{ close: [], saved: [] }>()

const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

const allergenItems = computed(() => ALLERGENS.map(k => ({ value: k as string, label: t(`bar.allergen.${k}`) })))
// A stock item's label is the item's own, not a product's.
const sourceItems = computed(() => (['label', 'supplier', 'other'] as const).map(s => ({ value: s, label: s === 'label' && props.target?.endpoint.includes('/stock/items/') ? t('bar.screens.stock.sources-label') : t(`bar.screens.product.sources.${s}`) })))
const label = ref<{ contains: string[], mayContain: string[], source: 'label' | 'supplier' | 'other' }>({ contains: [], mayContain: [], source: 'label' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(() => props.target, (target) => {
  refusal.value = null
  label.value = { contains: [...target?.contains ?? []], mayContain: [...target?.mayContain ?? []], source: 'label' }
}, { immediate: true })

async function save() {
  const l = label.value
  refusal.value = null
  try {
    await $api(props.target!.endpoint, { method: 'POST', body: { ...l, mayContain: l.mayContain.filter(k => !l.contains.includes(k)) } })
    toast.add({ title: t('bar.screens.product.allergens-saved'), color: 'success' })
    emit('saved')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    :open="!!target"
    :title="target?.title ?? ''"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <UForm
        v-if="target"
        id="bar-allergen-dialog"
        novalidate
        :state="label"
        class="space-y-4"
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <p class="text-sm text-muted">
          {{ help }}
        </p>
        <UFormField name="contains">
          <UCheckboxGroup
            v-model="label.contains"
            :legend="t('bar.screens.product.contains')"
            :items="allergenItems"
            class="columns-2"
          />
        </UFormField>
        <UFormField
          :help="t('bar.screens.product.may-contain-help')"
          name="mayContain"
        >
          <UCheckboxGroup
            v-model="label.mayContain"
            :legend="t('bar.screens.product.may-contain')"
            :items="allergenItems.filter(i => !label.contains.includes(i.value))"
            class="columns-2"
          />
        </UFormField>
        <UFormField
          :label="t('bar.screens.product.source')"
          name="source"
        >
          <USelect
            v-model="label.source"
            :items="sourceItems"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="bar-allergen-dialog"
        :label="t('bar.screens.product.allergens-record')"
      />
    </template>
  </UModal>
</template>
