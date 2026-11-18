<!-- Award types: what the theatre can give, each with how many hold it now. Archived ones sit below
     a divider. A new type can be given straight away. -->
<script setup lang="ts">
import type { TypeForm } from '../../../../../components/AwardsTypeFields.vue'

interface AwardType { id: string, name: string, summary: string | null, givesTicketBenefit: boolean, state: 'active' | 'archived', holders: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ types: AwardType[] }>('/api/awards/types', { key: 'awards:types' })
const active = computed(() => (data.value?.types ?? []).filter(x => x.state === 'active'))
const archived = computed(() => (data.value?.types ?? []).filter(x => x.state === 'archived'))
const describe = (x: AwardType) => [t('awards.screens.types.holders', { count: x.holders }), x.givesTicketBenefit ? t('awards.screens.types.with-benefit') : null].filter(Boolean).join(' · ')

const blank = (): TypeForm => ({ name: '', key: '', summary: '', givesTicketBenefit: false, onePerPerson: false, defaultVisibility: 'public' })
const open = ref(false)
const form = ref<TypeForm>(blank())
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
// The address follows the name until somebody types one.
const keyTouched = ref(false)
watch(() => form.value.name, (name) => {
  if (!keyTouched.value) form.value.key = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) // not-policy: the address's bound
})
function openAdd() {
  form.value = blank()
  keyTouched.value = false
  refusal.value = null
  idempotency = crypto.randomUUID()
  open.value = true
}
async function create() {
  refusal.value = null
  try {
    const made = await $api<{ typeId: string }>('/api/awards/types', { method: 'POST', headers: { 'idempotency-key': idempotency }, body: { ...form.value, summary: form.value.summary.trim() || null } })
    open.value = false
    await navigateTo(`/admin/modules/awards/types/${made.typeId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <PageFrame
    :title="t('awards.navigation.types.label')"
    :description="t('awards.screens.types.help')"
  >
    <template #primary>
      <UButton
        :label="t('awards.screens.types.add')"
        icon="i-lucide-plus"
        @click="openAdd"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.types.length"
        icon="i-lucide-award"
        :title="t('awards.screens.types.empty')"
        :description="t('awards.screens.types.empty-help')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList
          v-if="active.length"
          :label="t('awards.navigation.types.label')"
        >
          <RecordListItem
            v-for="x in active"
            :key="x.id"
            :to="`/admin/modules/awards/types/${x.id}`"
            icon="i-lucide-award"
            :name="x.name"
            :description="describe(x)"
          />
        </RecordList>
        <CollapsibleDivider
          v-if="archived.length"
          :label="t('awards.screens.types.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('awards.screens.types.archived')">
            <RecordListItem
              v-for="x in archived"
              :key="x.id"
              :to="`/admin/modules/awards/types/${x.id}`"
              icon="i-lucide-award"
              :name="x.name"
              :description="describe(x)"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('awards.screens.types.add')"
    >
      <template #body>
        <UForm
          id="awards-new-type"
          ref="formEl"
          :state="form"
          :validate="() => needs({ name: form.name, key: form.key })"
          class="space-y-4"
          novalidate
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <AwardsTypeFields
            v-model="form"
            @key-touched="keyTouched = true"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="awards-new-type"
          loading-auto
          :label="t('awards.screens.types.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
