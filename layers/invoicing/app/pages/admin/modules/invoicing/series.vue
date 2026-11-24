<!-- Invoice numbering (IE-07, wireframe S9): each series of invoices or credit notes with the number
     it gives next, one default for each kind. A number is taken only when an invoice is issued, so
     none is skipped. Archived series sit below a divider. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Series { id: string, name: string, kind: 'invoice' | 'credit_note', prefix: string, pad: number, isDefault: boolean, archivedAt: number | null, next: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { offer } = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ series: Series[] }>('/api/invoicing/series', { key: 'invoicing:series' })
const live = computed(() => (data.value?.series ?? []).filter(s => !s.archivedAt))
const archived = computed(() => (data.value?.series ?? []).filter(s => s.archivedAt))
const kindItems = computed(() => (['invoice', 'credit_note'] as const).map(k => ({ value: k, label: t(`invoicing.screens.series.kinds.${k}`) })))
const describe = (s: Series) => [t(`invoicing.screens.series.kinds.${s.kind}`), t('invoicing.screens.series.next', { number: s.next }), s.isDefault ? t('invoicing.screens.series.default') : null].filter(Boolean).join(' · ')

const editing = ref<Series | null>(null)
const open = ref(false)
const form = reactive({ name: '', kind: 'invoice' as Series['kind'], prefix: '', pad: 4 })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
let idempotency = ''
function start(s: Series | null) {
  editing.value = s
  Object.assign(form, { name: s?.name ?? '', kind: s?.kind ?? 'invoice', prefix: s?.prefix ?? '', pad: s?.pad ?? 4 }) // not-policy: the usual padding
  refusal.value = null
  idempotency = crypto.randomUUID()
  open.value = true
}
async function save() {
  refusal.value = null
  const body = { name: form.name.trim(), prefix: form.prefix.trim(), pad: form.pad }
  try {
    if (editing.value) await $api(`/api/invoicing/series/${editing.value.id}` as string, { method: 'PATCH', body })
    else await $api('/api/invoicing/series', { method: 'POST', headers: { 'idempotency-key': idempotency }, body: { ...body, kind: form.kind } })
    open.value = false
    toast.add({ title: t('invoicing.screens.series.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function change(s: Series, body: Record<string, unknown>) {
  await $api(`/api/invoicing/series/${s.id}` as string, { method: 'PATCH', body })
  await refresh()
}
async function attempt(s: Series, body: Record<string, unknown>, undo?: Record<string, unknown>) {
  try {
    await change(s, body)
    if (undo) offer(t('invoicing.screens.series.archived-toast', { name: s.name }), () => change(s, undo))
  }
  catch (e) {
    const r = toRefusal(e)
    toast.add({ title: r.reason, description: r.remedy, color: 'error' })
  }
}
const actions = (s: Series): DropdownMenuItem[] => [
  { label: t('invoicing.screens.series.edit'), icon: 'i-lucide-pencil', onSelect: () => start(s) },
  ...(!s.isDefault && !s.archivedAt ? [{ label: t('invoicing.screens.series.make-default'), icon: 'i-lucide-star', onSelect: () => attempt(s, { isDefault: true }) }] : []),
  ...(s.isDefault
    ? []
    : [s.archivedAt
        ? { label: t('invoicing.screens.series.restore'), icon: 'i-lucide-archive-restore', onSelect: () => attempt(s, { archived: false }) }
        : { label: t('invoicing.screens.series.archive'), icon: 'i-lucide-archive', onSelect: () => attempt(s, { archived: true }, { archived: false }) }]),
]
</script>

<template>
  <PageFrame
    :title="t('invoicing.navigation.series.label')"
    :description="t('invoicing.screens.series.help')"
  >
    <template #primary>
      <PageActions :actions="[{ label: t('invoicing.screens.series.new'), icon: 'i-lucide-plus', onSelect: () => start(null) }]" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RecordList :label="t('invoicing.navigation.series.label')">
          <RecordListItem
            v-for="s in live"
            :key="s.id"
            icon="i-lucide-list-ordered"
            :name="s.name"
            :description="describe(s)"
          >
            <RowActions
              :items="actions(s)"
              :label="t('invoicing.screens.series.actions', { name: s.name })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('invoicing.screens.series.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('invoicing.screens.series.archived')">
            <RecordListItem
              v-for="s in archived"
              :key="s.id"
              icon="i-lucide-list-ordered"
              :name="s.name"
              :description="describe(s)"
              muted
            >
              <RowActions
                :items="actions(s)"
                :label="t('invoicing.screens.series.actions', { name: s.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <UModal
      v-model:open="open"
      :title="t(editing ? 'invoicing.screens.series.edit' : 'invoicing.screens.series.new')"
    >
      <template #body>
        <UForm
          id="invoicing-series"
          ref="formEl"
          :state="form"
          :validate="() => needs({ name: form.name })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('invoicing.screens.series.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField
            v-if="!editing"
            name="kind"
            :label="t('invoicing.screens.series.kind')"
          >
            <USelect
              v-model="form.kind"
              :items="kindItems"
            />
          </UFormField>
          <UFormField
            name="prefix"
            :label="t('invoicing.screens.series.prefix')"
            :help="t('invoicing.screens.series.prefix-help')"
          >
            <UInput
              v-model="form.prefix"
              maxlength="12"
            />
          </UFormField>
          <UFormField
            name="pad"
            :label="t('invoicing.screens.series.pad')"
            :help="t('invoicing.screens.series.pad-help')"
          >
            <FieldNumber
              v-model="form.pad"
              :min="1"
              :max="8"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="invoicing-series"
          :loading="formEl?.loading"
          :label="t('invoicing.screens.series.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
