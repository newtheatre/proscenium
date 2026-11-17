<script setup lang="ts">
// Run presets (run presets, Matt 2026-11-17): named start times, each with its days, that Add a run
// starts from. Anyone who adds runs may save one from that window; here they are changed and deleted.
// A space may name its usual preset, and the theatre's own is chosen in the Programme settings.
import { rowSlots, slotRows, slotsInWords, type RunSlot, type SlotRow } from '../../../../utils/show-defaults'

interface Preset { id: string, name: string, slots: RunSlot[], spaces: number }

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Preset[], usual: string | null }>('/api/core/run-presets', { key: 'core:run-presets' })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function run(fn: () => Promise<unknown>, done: string) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    toast.add({ title: done, color: 'success' })
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
  const ok = editId.value
    ? await run(() => $api<unknown>(`/api/core/run-presets/${editId.value}` as string, { method: 'PUT', body }), 'Preset saved')
    : await run(() => $api<unknown>('/api/core/run-presets' as string, { method: 'POST', body }), 'Preset added')
  if (ok) editing.value = false
}
async function remove(p: Preset) {
  const used = p.spaces ? ` ${p.spaces === 1 ? 'One space uses' : `${p.spaces} spaces use`} it and will start from the theatre's usual preset instead.` : ''
  if (!await confirm({ verb: 'Delete', thing: p.name, consequence: `Runs already added keep their performances.${used}`, button: 'Delete preset' })) return
  await run(() => $api<unknown>(`/api/core/run-presets/${p.id}` as string, { method: 'DELETE' }), 'Preset deleted')
}
const describe = (p: Preset) => [slotsInWords(p.slots), ...(p.spaces ? [`usual for ${p.spaces === 1 ? 'one space' : `${p.spaces} spaces`}`] : [])].join(' · ')
const actions = (p: Preset) => [[
  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => open(p) },
  { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(p) },
]]
</script>

<template>
  <PageFrame
    title="Run presets"
    description="Start times, each with its days, that Add a run starts from. Anyone who adds runs can save one there."
    width="reading"
  >
    <template #primary>
      <UButton
        label="New preset"
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
          title="No run presets yet"
          description="A preset fills in a run's start times, such as evenings Tuesday to Saturday with a Saturday matinee."
          icon="i-lucide-calendar-clock"
        />
        <RecordList
          v-else
          label="Run presets"
        >
          <RecordListItem
            v-for="p in data.rows"
            :key="p.id"
            :name="p.name"
            :description="describe(p)"
          >
            <UBadge
              v-if="p.id === data.usual"
              label="The theatre's usual"
              color="neutral"
              variant="subtle"
            />
            <RowActions
              :items="actions(p)"
              :label="`Actions for ${p.name}`"
            />
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? 'Change preset' : 'New preset'"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <UForm
          id="run-preset-form"
          :state="form"
          class="space-y-4"
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Name"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            label="Performances"
            help="One line for each start time, with the days it runs on."
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
          :label="editId ? 'Save preset' : 'Add preset'"
          :disabled="!form.name.trim() || !slots.length"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
