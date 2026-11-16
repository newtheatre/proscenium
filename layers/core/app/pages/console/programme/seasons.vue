<script setup lang="ts">
// Seasons: dated labels that group productions. Edit, publish, archive; a draft with no
// productions can be deleted. Archived seasons leave what's on and stay in the archive.
definePageMeta({ layout: 'console' })

type State = 'draft' | 'published' | 'archived'
interface Season { id: string, name: string, startsOn: string, endsOn: string, summary: string | null, state: State, productions: number }

const { data, status, error, refresh } = await useFetch<{ rows: Season[] }>('/api/core/seasons', { key: 'core:seasons', query: { size: 100 } })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const TONES = { draft: 'neutral', published: 'success', archived: 'info' } as const
const dates = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const span = (s: Season) => (s.startsOn === s.endsOn ? dates.format(new Date(s.startsOn)) : `${dates.format(new Date(s.startsOn))} to ${dates.format(new Date(s.endsOn))}`)

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
const form = reactive({ name: '', startsOn: '', endsOn: '', summary: '' })
function open(s?: Season) {
  editId.value = s?.id ?? null
  Object.assign(form, s ? { name: s.name, startsOn: s.startsOn, endsOn: s.endsOn, summary: s.summary ?? '' } : { name: '', startsOn: '', endsOn: '', summary: '' })
  refusal.value = null
  editing.value = true
}
async function save() {
  const body = { ...form, endsOn: form.endsOn || form.startsOn }
  const ok = editId.value
    ? await run(() => $fetch<unknown>(`/api/core/seasons/${editId.value}` as string, { method: 'PATCH', body }), 'Season saved')
    : await run(() => $fetch<unknown>('/api/core/seasons' as string, { method: 'POST', body }), 'Season added')
  if (ok) editing.value = false
}
const move = (s: Season, to: State, done: string) => run(() => $fetch<unknown>(`/api/core/seasons/${s.id}/state` as string, { method: 'POST', body: { to } }), done)
async function remove(s: Season) {
  if (!await confirm({ verb: 'Delete', thing: s.name, consequence: 'The season is removed for good.', button: 'Delete season' })) return
  await run(() => $fetch<unknown>(`/api/core/seasons/${s.id}` as string, { method: 'DELETE' }), 'Season deleted')
}
const actions = (s: Season) => [[
  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => open(s) },
  ...(s.state === 'draft' ? [{ label: 'Publish', icon: 'i-lucide-globe', onSelect: () => move(s, 'published', 'Season published') }] : []),
  ...(s.state === 'published' ? [{ label: 'Archive', icon: 'i-lucide-archive', onSelect: () => move(s, 'archived', 'Season archived') }, { label: 'Back to draft', icon: 'i-lucide-undo-2', onSelect: () => move(s, 'draft', 'Season back to draft') }] : []),
  ...(s.state === 'archived' ? [{ label: 'Publish again', icon: 'i-lucide-globe', onSelect: () => move(s, 'published', 'Season published') }] : []),
  ...(s.state === 'draft' && !s.productions ? [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(s) }] : []),
]]
</script>

<template>
  <PageFrame
    title="Seasons"
    description="A season groups productions under a name and dates. Archived seasons leave what's on and stay in the archive."
    width="reading"
  >
    <template #primary>
      <UButton
        label="New season"
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
          title="No seasons yet"
          description="Seasons are optional. Use them to group productions, such as Autumn 2027."
          icon="i-lucide-calendar-range"
        />
        <RecordList
          v-else
          label="Seasons"
        >
          <RecordListItem
            v-for="s in data.rows"
            :key="s.id"
            :name="s.name"
            :description="`${span(s)} · ${s.productions === 1 ? '1 production' : `${s.productions} productions`}`"
          >
            <StatusBadge
              :tone="TONES[s.state]"
              :label="s.state.charAt(0).toUpperCase() + s.state.slice(1)"
            />
            <UDropdownMenu :items="actions(s)">
              <UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Actions for ${s.name}`"
              />
            </UDropdownMenu>
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? 'Edit season' : 'New season'"
    >
      <template #body>
        <UForm
          id="season-form"
          :state="form"
          class="space-y-4"
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Name"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="120"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="First day"
              required
            >
              <UInput
                v-model="form.startsOn"
                type="date"
              />
            </UFormField>
            <UFormField
              label="Last day"
              hint="Optional"
            >
              <UInput
                v-model="form.endsOn"
                type="date"
              />
            </UFormField>
          </div>
          <UFormField label="Summary">
            <UTextarea
              v-model="form.summary"
              :rows="3"
              maxlength="4000"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="season-form"
          :label="editId ? 'Save season' : 'Add season'"
          :disabled="!form.name.trim() || !form.startsOn"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
