<script setup lang="ts">
// Closures (C-18): times when the whole theatre, a venue or one space is shut. A blocking closure
// refuses a performance scheduled inside it. Public holidays, once imported, are listed greyed and
// only warn. Times are shown and entered in the theatre's time zone, whatever the viewer's.

interface Closure { id: string, venueId: string | null, spaceId: string | null, kind: 'closure' | 'public_holiday', title: string, startsAt: number, endsAt: number, allDay: boolean, blocksPerformances: boolean, source: 'manual' | 'feed' }
interface Place { id: string, name: string, spaces: { id: string, name: string }[] }

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Closure[], places: Place[] }>('/api/core/closures', { key: 'core:closures' })
const dates = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// An all-day closure ends at the start of the day after its last; show the last day itself.
const when = (c: Closure) => c.allDay ? dates.range(c.startsAt, c.endsAt - 1, 'dayNamed') : dates.range(c.startsAt, c.endsAt, 'dateTime')
function where(c: Closure): string {
  if (!c.venueId) return 'The whole theatre'
  const venue = data.value?.places.find(p => p.id === c.venueId)
  if (!c.spaceId) return venue?.name ?? 'A venue'
  const space = venue?.spaces.find(s => s.id === c.spaceId)
  return space ? `${space.name}, ${venue!.name}` : venue?.name ?? 'A space'
}

const WHOLE = 'theatre'
const adding = ref(false)
const form = reactive({ scope: WHOLE, title: '', allDay: true, days: { start: '', end: '' }, from: null as number | null, to: null as number | null, blocksPerformances: true })
const scopes = computed(() => [
  { value: WHOLE, label: 'The whole theatre' },
  ...(data.value?.places ?? []).flatMap(v => [
    { value: v.id, label: v.name },
    ...(v.spaces.length > 1 ? v.spaces.map(s => ({ value: `${v.id}/${s.id}`, label: `${v.name}: ${s.name}` })) : []),
  ]),
])
function openAdd() {
  Object.assign(form, { scope: WHOLE, title: '', allDay: true, days: { start: '', end: '' }, from: null, to: null, blocksPerformances: true })
  refusal.value = null
  adding.value = true
}
async function add() {
  refusal.value = null
  const [venueId, spaceId] = form.scope === WHOLE ? [null, null] : [form.scope.split('/')[0]!, form.scope.split('/')[1] ?? null]
  // The route takes days, or local dates and times in the theatre's time zone.
  const [from, to] = form.allDay ? [form.days.start, form.days.end || form.days.start] : [dates.toLocal(form.from), dates.toLocal(form.to)]
  try {
    const { id } = await $api<{ id: string }>('/api/core/closures', { method: 'POST', body: { venueId, spaceId, title: form.title, allDay: form.allDay, from, to, blocksPerformances: form.blocksPerformances } })
    adding.value = false
    await refresh()
    offer('Closure added', async () => {
      await $api(`/api/core/closures/${id}` as string, { method: 'DELETE' })
      await refresh()
    })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function remove(c: Closure) {
  if (!await confirm({ verb: 'Delete', thing: `the closure ${c.title}`, consequence: 'Performances can be scheduled in this time again.', button: 'Delete closure' })) return
  refusal.value = null
  try {
    await $api(`/api/core/closures/${c.id}` as string, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Closure deleted', color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    title="Closures"
    description="Times when the theatre, a venue or a space is shut. A closure that blocks performances stops one being scheduled inside it."
  >
    <template #primary>
      <UButton
        label="New closure"
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
      <div class="space-y-4">
        <RefusalNotice
          v-if="!adding"
          :refusal="refusal"
        />
        <EmptyState
          v-if="!data?.rows.length"
          title="No closures coming up"
          description="Add a closure for a holiday shutdown, building work or anything else that keeps the doors shut."
          icon="i-lucide-calendar-x"
        />
        <RecordList
          v-else
          label="Closures"
        >
          <RecordListItem
            v-for="c in data.rows"
            :key="c.id"
            :name="c.title"
            :description="`${when(c)} · ${where(c)}`"
            :muted="c.kind === 'public_holiday'"
          >
            <StatusBadge
              v-if="c.kind === 'public_holiday'"
              tone="neutral"
              label="Public holiday"
            />
            <StatusBadge
              v-else-if="c.blocksPerformances"
              tone="warning"
              label="Blocks performances"
            />
            <IconButton
              v-if="c.source === 'manual'"
              icon="i-lucide-trash-2"
              size="sm"
              :label="`Delete ${c.title}`"
              @click="remove(c)"
            />
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="adding"
      title="New closure"
    >
      <template #body>
        <UForm
          id="new-closure"
          :state="form"
          :validate="() => needs({ title: form.title, ...(form.allDay ? { days: form.days.start } : { from: form.from, to: form.to }) })"
          class="space-y-4"
          novalidate
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="title"
            label="What it is"
            required
          >
            <UInput
              v-model="form.title"
              placeholder="Christmas shutdown"
              maxlength="120"
            />
          </UFormField>
          <UFormField label="Where">
            <USelectMenu
              v-model="form.scope"
              value-key="value"
              :items="scopes"
            />
          </UFormField>
          <UCheckbox
            v-model="form.allDay"
            label="Whole days"
            description="Untick to give a start and an end time."
          />
          <UFormField
            v-if="form.allDay"
            name="days"
            label="Days"
            help="Choose one day, or a first and a last day."
            required
          >
            <FieldDateRange v-model="form.days" />
          </UFormField>
          <div
            v-else
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              name="from"
              label="From"
              required
            >
              <FieldDateTime v-model="form.from" />
            </UFormField>
            <UFormField
              name="to"
              label="Until"
              required
            >
              <FieldDateTime
                v-model="form.to"
                :min="form.from ?? undefined"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.blocksPerformances"
            label="Blocks performances"
            description="Turn off to show the closure on the calendar as a warning only."
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="new-closure"
          label="Add closure"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
