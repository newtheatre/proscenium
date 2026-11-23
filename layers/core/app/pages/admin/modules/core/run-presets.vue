<script setup lang="ts">
// Run presets (run presets, Matt 2026-11-17): named start times, each with its days, that Add a run
// starts from. Anyone who adds runs may save one from that window; here they are changed and deleted.
// A space may name its usual preset, and the theatre's own is chosen in the Programme settings.
import { rowSlots, slotRows, slotsInWords, type RunSlot, type SlotRow } from '../../../../utils/show-defaults'

interface Preset { id: string, name: string, slots: RunSlot[], spaces: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Preset[], usual: string | null }>('/api/core/run-presets', { key: 'core:run-presets' })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// Says what was done, with an Undo where the act has a clean reverse.
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>) {
  refusal.value = null
  try {
    const result = await fn()
    await refresh()
    if (undo) {
      offer(done, async () => {
        await undo(result)
        await refresh()
      })
    }
    else {
      toast.add({ title: done, color: 'success' })
    }
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

const editing = ref(false)
const editId = ref<string | null>(null)
const form = reactive({ name: '', rows: [] as SlotRow[] })
const slots = computed(() => rowSlots(form.rows))
function open(p?: Preset) {
  editId.value = p?.id ?? null
  form.name = p?.name ?? ''
  form.rows = p ? slotRows(p.slots) : [{ time: '19:30', days: ['2', '3', '4', '5', '6'] }] // not-policy: a new preset's first line, Tuesday to Saturday evenings
  refusal.value = null
  editing.value = true
}
async function save() {
  const body = { name: form.name.trim(), slots: slots.value }
  const id = editId.value
  const before = data.value?.rows.find(p => p.id === id)
  const put = (to: typeof body) => $api<unknown>(`/api/core/run-presets/${id}` as string, { method: 'PUT', body: to })
  const ok = id
    ? await run(() => put(body), t('core.run-presets.saved'), before ? () => put({ name: before.name, slots: before.slots }) : undefined)
    : await run(() => $api<{ id: string }>('/api/core/run-presets' as string, { method: 'POST', body }), t('core.run-presets.added'), made => $api<unknown>(`/api/core/run-presets/${made.id}` as string, { method: 'DELETE' }))
  if (ok) editing.value = false
}
async function remove(p: Preset) {
  const consequence = p.spaces ? t('core.run-presets.delete-consequence-used', { count: p.spaces }) : t('core.run-presets.delete-consequence')
  if (!await confirm({ verb: t('core.run-presets.delete'), thing: p.name, consequence, button: t('core.run-presets.delete-button') })) return
  // With no space using it, adding the same preset again is a clean reverse.
  const again = () => $api<unknown>('/api/core/run-presets' as string, { method: 'POST', body: { name: p.name, slots: p.slots } })
  await run(() => $api<unknown>(`/api/core/run-presets/${p.id}` as string, { method: 'DELETE' }), t('core.run-presets.deleted'), p.spaces ? undefined : again)
}
const describe = (p: Preset) => [slotsInWords(p.slots), ...(p.spaces ? [t('core.run-presets.usual-for', { count: p.spaces })] : [])].join(' · ')
const actions = (p: Preset) => [[
  { label: t('core.run-presets.edit'), icon: 'i-lucide-pencil', onSelect: () => open(p) },
  { label: t('core.run-presets.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(p) },
]]
</script>

<template>
  <PageFrame
    :title="t('core.run-presets.run-presets')"
    :description="t('core.run-presets.description-start-times-each')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('core.run-presets.new-preset')"
        icon="i-lucide-plus"
        @click="open()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RefusalNotice
          v-if="!editing"
          :refusal="refusal"
        />
        <EmptyState
          v-if="!data?.rows.length"
          :title="t('core.run-presets.no-run-presets-yet')"
          :description="t('core.run-presets.description-a-preset-fills')"
          icon="i-lucide-calendar-clock"
        />
        <RecordList
          v-else
          :label="t('core.run-presets.run-presets')"
        >
          <RecordListItem
            v-for="p in data.rows"
            :key="p.id"
            :name="p.name"
            :description="describe(p)"
          >
            <UBadge
              v-if="p.id === data.usual"
              :label="t('core.run-presets.the-theatres-usual')"
              color="neutral"
              variant="subtle"
            />
            <RowActions
              :items="actions(p)"
              :label="t('core.run-presets.actions-for', { name: p.name })"
            />
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('core.run-presets.change-preset') : t('core.run-presets.new-preset')"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <UForm
          id="run-preset-form"
          :state="form"
          :validate="() => needs({ name: form.name, slots: slots.length > 0 })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('core.run-presets.name')"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            :label="t('core.run-presets.performances')"
            :help="t('core.run-presets.help-one-line-for')"
            name="slots"
            required
          >
            <RunSlotsField v-model="form.rows" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="run-preset-form"
          :label="editId ? t('core.run-presets.save-preset') : t('core.run-presets.add-preset')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
