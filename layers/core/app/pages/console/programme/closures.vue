<script setup lang="ts">
// Closures (C-18): times when the whole theatre, a venue or one space is shut. A blocking closure
// refuses a performance scheduled inside it. Public holidays, once imported, are listed greyed and
// only warn. Times are shown and entered in the theatre's time zone, whatever the viewer's.

interface Closure { id: string, venueId: string | null, spaceId: string | null, kind: 'closure' | 'public_holiday', title: string, startsAt: number, endsAt: number, allDay: boolean, blocksPerformances: boolean, source: 'manual' | 'feed' }
interface Place { id: string, name: string, spaces: { id: string, name: string }[] }

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Closure[], places: Place[] }>('/api/core/closures', { key: 'core:closures' })
const { data: settings } = await usePublicSettings()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const timeZone = computed(() => (settings.value?.['core.locale.time-zone']?.value as string | undefined) ?? undefined)
const dateOnly = computed(() => new Intl.DateTimeFormat('en-GB', { timeZone: timeZone.value, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))
const dateTime = computed(() => new Intl.DateTimeFormat('en-GB', { timeZone: timeZone.value, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
function when(c: Closure): string {
  if (!c.allDay) return `${dateTime.value.format(c.startsAt)} to ${dateTime.value.format(c.endsAt)}`
  // An all-day closure ends at the start of the day after its last; show the last day itself.
  const first = dateOnly.value.format(c.startsAt)
  const last = dateOnly.value.format(c.endsAt - 1)
  return first === last ? first : `${first} to ${last}`
}
function where(c: Closure): string {
  if (!c.venueId) return 'The whole theatre'
  const venue = data.value?.places.find(p => p.id === c.venueId)
  if (!c.spaceId) return venue?.name ?? 'A venue'
  const space = venue?.spaces.find(s => s.id === c.spaceId)
  return space ? `${space.name}, ${venue!.name}` : venue?.name ?? 'A space'
}

const WHOLE = 'theatre'
const adding = ref(false)
const form = reactive({ scope: WHOLE, title: '', allDay: true, from: '', to: '', blocksPerformances: true })
const scopes = computed(() => [
  { value: WHOLE, label: 'The whole theatre' },
  ...(data.value?.places ?? []).flatMap(v => [
    { value: v.id, label: v.name },
    ...(v.spaces.length > 1 ? v.spaces.map(s => ({ value: `${v.id}/${s.id}`, label: `${v.name}: ${s.name}` })) : []),
  ]),
])
watch(() => form.allDay, () => {
  form.from = ''
  form.to = ''
})
function openAdd() {
  Object.assign(form, { scope: WHOLE, title: '', allDay: true, from: '', to: '', blocksPerformances: true })
  refusal.value = null
  adding.value = true
}
async function add() {
  refusal.value = null
  const [venueId, spaceId] = form.scope === WHOLE ? [null, null] : [form.scope.split('/')[0]!, form.scope.split('/')[1] ?? null]
  try {
    await $api('/api/core/closures', { method: 'POST', body: { venueId, spaceId, title: form.title, allDay: form.allDay, from: form.from, to: form.to || form.from, blocksPerformances: form.blocksPerformances } })
    adding.value = false
    await refresh()
    toast.add({ title: 'Closure recorded', color: 'success' })
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
          description="Record a closure for a holiday shutdown, building work or anything else that keeps the doors shut."
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
            <UButton
              v-if="c.source === 'manual'"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Delete ${c.title}`"
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
          class="space-y-4"
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
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
            <USelect
              v-model="form.scope"
              :items="scopes"
            />
          </UFormField>
          <USwitch
            v-model="form.allDay"
            label="Whole days"
          />
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="form.allDay ? 'First day' : 'From'"
              required
            >
              <UInput
                v-model="form.from"
                :type="form.allDay ? 'date' : 'datetime-local'"
              />
            </UFormField>
            <UFormField
              :label="form.allDay ? 'Last day' : 'Until'"
              :hint="form.allDay ? 'Optional' : undefined"
              :required="!form.allDay"
            >
              <UInput
                v-model="form.to"
                :type="form.allDay ? 'date' : 'datetime-local'"
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
          label="Record closure"
          :disabled="!form.title.trim() || !form.from || (!form.allDay && !form.to)"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
