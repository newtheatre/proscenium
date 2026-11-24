<!-- New company (CO-06, rule G1): its name, with any company whose name nearly matches offered
     before it is added, archived ones included. Adding opens the new company's page. -->
<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

interface Match { id: string, name: string, archived: boolean }

const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive({ name: '' })
const matches = ref<Match[]>([])
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')

watch(open, (now) => {
  if (!now) return
  form.name = ''
  matches.value = []
  refusal.value = null
})
watchDebounced(() => form.name, async (name) => {
  matches.value = name.trim()
    ? (await $api<{ matches: Match[] }>('/api/companies/matches', { query: { name } }).catch(() => ({ matches: [] }))).matches
    : []
}, { debounce: 300 }) // not-policy: a pause in typing

async function add() {
  refusal.value = null
  try {
    const { companyId } = await $api<{ companyId: string }>('/api/companies', { method: 'POST', body: { name: form.name } })
    open.value = false
    await navigateTo(`/console/companies/${companyId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formRef.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('companies.new')"
    :description="t('companies.new-description')"
  >
    <template #body>
      <UForm
        id="company-new"
        ref="formEl"
        :state="form"
        :validate="() => needs({ name: form.name })"
        class="space-y-4"
        novalidate
        @submit="add"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('companies.field.name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="160"
            autocomplete="off"
          />
        </UFormField>
        <UAlert
          v-if="matches.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-copy"
          :title="t('companies.near-match.title')"
          :description="t('companies.near-match.description')"
        >
          <template #actions>
            <UButton
              v-for="m in matches"
              :key="m.id"
              :label="m.archived ? t('companies.near-match.open-archived', { name: m.name }) : t('companies.near-match.open', { name: m.name })"
              :to="`/console/companies/${m.id}`"
              color="neutral"
              variant="outline"
              size="sm"
              @click="open = false"
            />
          </template>
        </UAlert>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="company-new"
        :label="matches.length ? t('companies.near-match.add-anyway') : t('companies.add')"
      />
    </template>
  </UModal>
</template>
