<script setup lang="ts">
// Seasons: dated labels that group productions. Edit, publish, archive; a draft with no
// productions can be deleted. Archived seasons leave what's on and stay in the archive, folded
// under a divider below the others. Every change can be undone from its toast.

type State = 'draft' | 'published' | 'archived'
interface Season { id: string, name: string, startsOn: string, endsOn: string, summary: string | null, state: State, productions: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Season[] }>('/api/core/seasons', { key: 'core:seasons', query: { size: 100 } })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const TONES = { draft: 'neutral', published: 'success', archived: 'info' } as const
const dates = useDates()
const span = (s: Season) => dates.range(s.startsOn, s.endsOn)

// A search that opens from its icon, and archived seasons below the others.
const search = ref('')
const searching = ref(false)
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.rows ?? []).filter(s => !words || s.name.toLowerCase().includes(words))
})
const current = computed(() => matching.value.filter(s => s.state !== 'archived'))
const archived = computed(() => matching.value.filter(s => s.state === 'archived'))
const showArchived = ref(false)
watch(search, (words) => { if (words.trim() && archived.value.length) showArchived.value = true })

// Does the act, then says so with an Undo that does its reverse.
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>) {
  refusal.value = null
  try {
    const result = await fn()
    await refresh()
    offer(done, undo && (async () => {
      await undo(result)
      await refresh()
    }))
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

const editing = ref(false)
const editId = ref<string | null>(null)
const form = reactive({ name: '', days: { start: '', end: '' }, summary: '' })
function open(s?: Season) {
  editId.value = s?.id ?? null
  Object.assign(form, s ? { name: s.name, days: { start: s.startsOn, end: s.endsOn }, summary: s.summary ?? '' } : { name: '', days: { start: '', end: '' }, summary: '' })
  refusal.value = null
  editing.value = true
}
const fields = (s: Season) => ({ name: s.name, startsOn: s.startsOn, endsOn: s.endsOn, summary: s.summary ?? '' })
const create = (body: ReturnType<typeof fields>) => $api<{ id: string }>('/api/core/seasons' as string, { method: 'POST', body })
const patch = (id: string, body: ReturnType<typeof fields>) => $api<unknown>(`/api/core/seasons/${id}` as string, { method: 'PATCH', body })
const destroy = (id: string) => $api<unknown>(`/api/core/seasons/${id}` as string, { method: 'DELETE' })
async function save() {
  const body = { name: form.name, startsOn: form.days.start, endsOn: form.days.end || form.days.start, summary: form.summary }
  const id = editId.value
  const before = data.value?.rows.find(s => s.id === id)
  const ok = id
    ? await run(() => patch(id, body), t('core.seasons.saved'), before ? () => patch(id, fields(before)) : undefined)
    : await run(() => create(body), t('core.seasons.added'), ({ id: added }) => destroy(added))
  if (ok) editing.value = false
}
const shift = (id: string, to: State) => $api<unknown>(`/api/core/seasons/${id}/state` as string, { method: 'POST', body: { to } })
const move = (s: Season, to: State, done: string) => run(() => shift(s.id, to), done, () => shift(s.id, s.state))
async function remove(s: Season) {
  if (!await confirm({ verb: t('core.seasons.delete'), thing: s.name, consequence: t('core.seasons.delete-consequence'), button: t('core.seasons.delete-button') })) return
  // A deleted season is a draft with no productions, so undoing it adds the same draft again.
  await run(() => destroy(s.id), t('core.seasons.deleted'), () => create(fields(s)))
}
const actions = (s: Season) => [[
  { label: t('core.seasons.edit'), icon: 'i-lucide-pencil', onSelect: () => open(s) },
  ...(s.state === 'draft' ? [{ label: t('core.seasons.publish'), icon: 'i-lucide-globe', onSelect: () => move(s, 'published', t('core.seasons.published')) }] : []),
  ...(s.state === 'published' ? [{ label: t('core.seasons.archive'), icon: 'i-lucide-archive', onSelect: () => move(s, 'archived', t('core.seasons.archived')) }, { label: t('core.seasons.to-draft'), icon: 'i-lucide-undo-2', onSelect: () => move(s, 'draft', t('core.seasons.back-to-draft')) }] : []),
  ...(s.state === 'archived' ? [{ label: t('core.seasons.publish-again'), icon: 'i-lucide-globe', onSelect: () => move(s, 'published', t('core.seasons.published')) }] : []),
  ...(s.state === 'draft' && !s.productions ? [{ label: t('core.seasons.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(s) }] : []),
]]
</script>

<template>
  <PageFrame
    :title="t('core.seasons.seasons')"
    :description="t('core.seasons.description-a-season-groups')"
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.rows.length"
        v-model="search"
        v-model:open="searching"
        :label="t('core.seasons.search-seasons')"
      />
      <UButton
        :label="t('core.seasons.new-season')"
        :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
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
          :title="t('core.seasons.no-seasons-yet')"
          :description="t('core.seasons.description-seasons-are-optional')"
          icon="i-lucide-calendar-range"
        />
        <template v-else>
          <p
            v-if="!matching.length"
            class="text-sm text-muted"
          >
            {{ t('core.seasons.no-match', { search: search.trim() }) }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('core.seasons.seasons')"
          >
            <RecordListItem
              v-for="s in current"
              :key="s.id"
              :name="s.name"
              :description="`${span(s)} · ${t('core.counts.productions', { count: s.productions })}`"
            >
              <StatusBadge
                :tone="TONES[s.state]"
                :label="t(`core.states.${s.state}`)"
              />
              <UButton
                v-if="s.state === 'draft'"
                :label="t('core.seasons.publish')"
                icon="i-lucide-globe"
                color="neutral"
                variant="outline"
                size="sm"
                :aria-label="t('core.seasons.publish-named', { name: s.name })"
                @click="move(s, 'published', t('core.seasons.published'))"
              />
              <RowActions
                :items="actions(s)"
                :label="t('core.seasons.actions-for', { name: s.name })"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            v-model:open="showArchived"
            :label="t('core.states.archived')"
            :count="archived.length"
          >
            <RecordList :label="t('core.seasons.archived-seasons')">
              <RecordListItem
                v-for="s in archived"
                :key="s.id"
                :name="s.name"
                :description="`${span(s)} · ${t('core.counts.productions', { count: s.productions })}`"
              >
                <RowActions
                  :items="actions(s)"
                  :label="t('core.seasons.actions-for', { name: s.name })"
                />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('core.seasons.edit-season') : t('core.seasons.new-season')"
    >
      <template #body>
        <UForm
          id="season-form"
          :state="form"
          :validate="() => needs({ name: form.name, days: form.days.start })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('core.seasons.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="days"
            :label="t('core.seasons.first-and-last-day')"
            required
          >
            <FieldDateRange v-model="form.days" />
          </UFormField>
          <UFormField :label="t('core.seasons.summary')">
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
          :label="editId ? t('core.seasons.save-season') : t('core.seasons.add-season')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
