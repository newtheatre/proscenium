<!-- One award type: its name, what it recognises and its rules. Archiving keeps every holder and
     their ticket benefit and only stops new awards; a type nobody has held can be deleted. -->
<script setup lang="ts">
import type { TypeForm } from '../../../../../components/AwardsTypeFields.vue'

interface Detail { type: TypeForm & { id: string, state: 'active' | 'archived' }, holders: number, deletable: boolean, canManage: boolean, nominations: boolean }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/awards/types/${id.value}`, { key: `awards:type:${id.value}` })
const type = computed(() => data.value?.type)

const form = ref<TypeForm>({ name: '', key: '', summary: '', givesTicketBenefit: false, onePerPerson: false, defaultVisibility: 'public' })
watch(type, (x) => {
  if (x) form.value = { name: x.name, key: x.key, summary: x.summary ?? '', givesTicketBenefit: x.givesTicketBenefit, onePerPerson: x.onePerPerson, defaultVisibility: x.defaultVisibility }
}, { immediate: true })
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function patch(body: Record<string, unknown>, done: string) {
  refusal.value = null
  try {
    await $api(`/api/awards/types/${id.value}` as string, { method: 'PATCH', body })
    toast.add({ title: done, color: 'success' })
    await Promise.all([refresh(), refreshNuxtData('awards:types')])
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
const save = () => patch({ ...form.value, summary: form.value.summary.trim() || null }, t('awards.screens.type.saved'))
async function archive() {
  if (!(await confirm({ verb: t('awards.screens.type.verb-archive'), thing: type.value!.name, consequence: t('awards.screens.type.confirm-archive'), button: t('awards.screens.type.archive') }))) return
  await patch({ state: 'archived' }, t('awards.screens.type.archived-toast'))
}
async function remove() {
  if (!(await confirm({ verb: t('awards.screens.type.verb-delete'), thing: type.value!.name, consequence: t('awards.screens.type.confirm-delete'), button: t('awards.screens.type.delete') }))) return
  try {
    await $api(`/api/awards/types/${id.value}` as string, { method: 'DELETE', body: {} })
    await refreshNuxtData('awards:types')
    await navigateTo('/admin/modules/awards/types')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
// Archive and Delete sit in the heading's menu, as they do on a membership scheme.
const actions = computed(() => [
  ...(type.value?.state === 'active' ? [{ label: t('awards.screens.type.archive'), icon: 'i-lucide-archive', onSelect: archive }] : []),
  ...(data.value?.deletable ? [{ label: t('awards.screens.type.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove }] : []),
])
</script>

<template>
  <PageFrame
    :title="type?.name ?? t('awards.navigation.types.label')"
    :trail="[{ label: t('awards.navigation.types.label'), to: '/admin/modules/awards/types' }]"
    width="reading"
  >
    <template
      v-if="type"
      #status
    >
      <StatusBadge
        :tone="type.state === 'active' ? 'success' : 'neutral'"
        :label="t(`awards.screens.type-states.${type.state}`)"
      />
    </template>
    <template
      v-if="type && data?.canManage"
      #primary
    >
      <RowActions
        :items="actions"
        :label="t('awards.screens.type.actions', { type: type.name })"
        variant="outline"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && type"
        class="space-y-6"
      >
        <UAlert
          v-if="type.state === 'archived'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-archive"
          :title="t('awards.screens.type.restore-help')"
          :actions="data.canManage ? [{ label: t('awards.screens.type.restore'), icon: 'i-lucide-archive-restore', color: 'neutral', variant: 'outline', onClick: () => patch({ state: 'active' }, t('awards.screens.type.restored-toast')) }] : undefined"
        />
        <PageSection
          :title="t('awards.screens.type.details')"
          :description="t('awards.screens.types.holders', { count: data.holders })"
        >
          <UForm
            id="awards-type"
            ref="formEl"
            :state="form"
            :validate="() => needs({ name: form.name, key: form.key })"
            class="space-y-4"
            novalidate
            @submit="save"
          >
            <RefusalNotice :refusal="refusal" />
            <AwardsTypeFields
              v-model="form"
              :key-fixed="!data.deletable"
            />
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="awards-type"
              loading-auto
              :label="t('awards.screens.type.save')"
            />
          </template>
        </PageSection>
        <PageSection
          v-if="data.nominations && data.canManage && type.state === 'active'"
          :title="t('awards.screens.type.nominations')"
          :description="t('awards.screens.type.nominations-help')"
        >
          <FormsSlotForms
            slot-id="awards.nomination"
            :subject="type.id"
          />
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
