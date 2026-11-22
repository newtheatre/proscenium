<!-- One award type, in a window over the list: its name, what it recognises and its rules, and the
     form people nominate with. Archiving stops new awards only; a type nobody has held can be deleted. -->
<script setup lang="ts">
import type { TypeForm } from './AwardsTypeFields.vue'

interface Detail { type: TypeForm & { id: string, state: 'active' | 'archived' }, holders: number, deletable: boolean, canManage: boolean, nominations: boolean }

const typeId = defineModel<string | null>('typeId', { required: true })
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const data = ref<Detail | null>(null)
const failed = ref<ReturnType<typeof toRefusal> | null>(null)
const type = computed(() => data.value?.type)
const form = ref<TypeForm>({ name: '', key: '', summary: '', givesTicketBenefit: false, onePerPerson: false, defaultVisibility: 'public' })
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function load() {
  failed.value = null
  refusal.value = null
  if (!typeId.value) return
  try {
    const found = await $api<Detail>(`/api/awards/types/${typeId.value}` as string)
    const x = found.type
    form.value = { name: x.name, key: x.key, summary: x.summary ?? '', givesTicketBenefit: x.givesTicketBenefit, onePerPerson: x.onePerPerson, defaultVisibility: x.defaultVisibility }
    data.value = found
  }
  catch (e) {
    data.value = null
    failed.value = toRefusal(e)
  }
}
watch(typeId, load, { immediate: true })

async function patch(body: Record<string, unknown>, done: string, close = false) {
  refusal.value = null
  try {
    await $api(`/api/awards/types/${typeId.value}` as string, { method: 'PATCH', body })
    toast.add({ title: done, color: 'success' })
    emit('changed')
    if (close) typeId.value = null
    else await load()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
const save = () => patch({ ...form.value, summary: form.value.summary.trim() || null }, t('awards.screens.type.saved'), true)
async function archive() {
  if (!(await confirm({ verb: t('awards.screens.type.verb-archive'), thing: type.value!.name, consequence: t('awards.screens.type.confirm-archive'), button: t('awards.screens.type.archive') }))) return
  await patch({ state: 'archived' }, t('awards.screens.type.archived-toast'), true)
}
async function remove() {
  if (!(await confirm({ verb: t('awards.screens.type.verb-delete'), thing: type.value!.name, consequence: t('awards.screens.type.confirm-delete'), button: t('awards.screens.type.delete') }))) return
  try {
    await $api(`/api/awards/types/${typeId.value}` as string, { method: 'DELETE', body: {} })
    emit('changed')
    typeId.value = null
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const actions = computed(() => !data.value?.canManage
  ? []
  : [
      ...(type.value?.state === 'active' ? [{ label: t('awards.screens.type.archive'), icon: 'i-lucide-archive', onSelect: archive }] : []),
      ...(data.value.deletable ? [{ label: t('awards.screens.type.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove }] : []),
    ])
</script>

<template>
  <UModal
    :open="!!typeId"
    :title="type?.name ?? t('awards.navigation.types.label')"
    :description="data ? t('awards.screens.types.holders', { count: data.holders }) : undefined"
    @update:open="v => { if (!v) typeId = null }"
  >
    <template #body>
      <RefusalNotice
        v-if="failed"
        :refusal="failed"
      />
      <div
        v-else-if="data && type"
        class="space-y-4"
      >
        <UAlert
          v-if="type.state === 'archived'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-archive"
          :title="t('awards.screens.type.restore-help')"
          :actions="data.canManage ? [{ label: t('awards.screens.type.restore'), icon: 'i-lucide-archive-restore', color: 'neutral', variant: 'outline', onClick: () => patch({ state: 'active' }, t('awards.screens.type.restored-toast')) }] : undefined"
        />
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
        <template v-if="data.nominations && data.canManage && type.state === 'active'">
          <USeparator :label="t('awards.screens.type.nominations')" />
          <p class="text-sm text-muted">
            {{ t('awards.screens.type.nominations-help') }}
          </p>
          <FormsSlotForms
            slot-id="awards.nomination"
            :subject="type.id"
          />
        </template>
      </div>
    </template>
    <template
      v-if="data"
      #footer
    >
      <RowActions
        :items="actions"
        :label="t('awards.screens.type.actions', { type: data.type.name })"
        variant="outline"
      />
      <UButton
        type="submit"
        form="awards-type"
        class="ms-auto"
        loading-auto
        :label="t('awards.screens.type.save')"
      />
    </template>
  </UModal>
</template>
