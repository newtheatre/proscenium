<!-- Linking a production to an engagement opened without one (CO-12): the production then carries the
     company's public name (G3). A production can have one engagement at a time (E6). -->
<script setup lang="ts">
const props = defineProps<{ engagementId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ linked: [title: string] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const picked = ref<{ id: string, label: string } | undefined>()

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  picked.value = undefined
})

async function link() {
  const production = picked.value
  if (!production) return
  refusal.value = null
  try {
    await $api(`/api/companies/engagements/${props.engagementId}/production` as string, { method: 'POST', body: { productionId: production.id } })
    open.value = false
    emit('linked', production.label)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('companies.engagements.link-title')"
    :description="t('companies.engagements.link-description')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UFormField :label="t('companies.field.production')">
          <CompaniesProductionPicker
            v-model="picked"
            :placeholder="t('companies.field.search-productions')"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <UButton
        :label="t('companies.engagements.link-button')"
        :disabled="!picked"
        loading-auto
        @click="link"
      />
    </template>
  </UModal>
</template>
