<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { parseTime } from '@internationalized/date'
import { watchDebounced } from '@vueuse/core'

// One performance's line-up (C-61): the acts in running order, each one of the theatre's productions
// or simply a name, with an optional set time inside the performance and a length. Acts are dragged
// into order, or moved from the keyboard or their menu. Below, the credits for this date only.
interface Item {
  id: string
  productionId: string | null
  name: string
  note: string | null
  startsAt: number | null
  minutes: number | null
  announced: boolean
  production: { id: string, slug: string, title: string } | null
}
interface Choice { id: string, label: string }

const props = defineProps<{ productionId: string, creditsPublic: boolean, performance: { id: string, startsAt: number, endsAt: number } }>()
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const dates = useDates()
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const base = computed(() => `/api/core/performances/${props.performance.id}/line-up`)
const { data, status, error, refresh } = await useAPI<{ items: Item[] }>(base, { key: `core:performance:${props.performance.id}:line-up` })
const items = computed(() => data.value?.items ?? [])
const acts = computed(() => items.value.map(i => ({ id: i.id, name: i.name })))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function act(fn: () => Promise<unknown>, done?: string, form?: { setErrors: (errors: { name: string, message: string }[]) => void } | null) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    emit('changed')
    if (done) toast.add({ title: done, color: 'success' })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form?.setErrors(fieldErrors(refusal.value))
    return false
  }
}

const describe = (i: Item) => [
  i.startsAt !== null ? `On at ${dates.time(i.startsAt)}` : null,
  i.minutes ? `${i.minutes} min` : null,
  i.production ? 'Their own production' : null,
  i.note,
].filter(Boolean).join(' · ') || undefined

// Adding and editing an act. A set time is a time of day; one earlier than the performance's start
// falls after midnight, on the show night's second calendar day.
const open = ref(false)
const editing = ref<Item | null>(null)
const form = ref({ production: undefined as Choice | undefined, name: '', note: '', time: '', seconds: undefined as number | null | undefined, announced: true })
const formRef = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('lineUpForm')
function start(item?: Item) {
  editing.value = item ?? null
  refusal.value = null
  form.value = item
    ? { production: item.production ? { id: item.production.id, label: item.production.title } : undefined, name: item.name, note: item.note ?? '', time: item.startsAt !== null ? dates.toLocal(item.startsAt).slice(11) : '', seconds: item.minutes ? item.minutes * 60 : undefined, announced: item.announced }
    : { production: undefined, name: '', note: '', time: '', seconds: undefined, announced: true }
  open.value = true
}
function localStart(time: string): string | null {
  if (!time) return null
  const [day, from] = [dates.toLocal(props.performance.startsAt).slice(0, 10), dates.toLocal(props.performance.startsAt).slice(11)] // not-policy: YYYY-MM-DD and HH:mm
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) // not-policy: a day in milliseconds; YYYY-MM-DD
  return `${time < from ? next : day}T${time}`
}
const timeValue = (value: string) => {
  try { return value ? parseTime(value) : undefined }
  catch { return undefined }
}

const search = ref('')
const found = ref<Choice[]>([])
const searching = ref(false)
watchDebounced(search, async (q) => {
  if (q.trim().length < 2) {
    found.value = []
    return
  }
  searching.value = true
  try {
    const answer = await $api<{ rows: { id: string, title: string }[] }>('/api/core/productions', { query: { q, size: 10 } }) // not-policy: a picker's length
    found.value = answer.rows.filter(r => r.id !== props.productionId).map(r => ({ id: r.id, label: r.title }))
  }
  catch {
    found.value = []
  }
  finally {
    searching.value = false
  }
}, { debounce: 250 }) // not-policy: typing pause before a search
const productionItems = computed(() => {
  const picked = form.value.production
  return picked && !found.value.some(p => p.id === picked.id) ? [picked, ...found.value] : found.value
})
watch(() => form.value.production, (p) => {
  if (p && !form.value.name.trim()) form.value.name = p.label
})

async function save() {
  const body = {
    name: form.value.name.trim() || undefined,
    note: form.value.note.trim() || null,
    startsAt: localStart(form.value.time),
    minutes: form.value.seconds ? Math.round(form.value.seconds / 60) : null, // not-policy: seconds in a minute
    announced: form.value.announced,
  }
  const ok = editing.value
    ? await act(() => $api(`${base.value}/${editing.value!.id}` as string, { method: 'PATCH', body }), 'Act saved', formRef.value)
    : await act(() => $api(base.value as string, { method: 'POST', body: { ...body, productionId: form.value.production?.id ?? null } }), 'Act added', formRef.value)
  if (ok) open.value = false
}

async function remove(item: Item) {
  if (!await confirm({ verb: 'Remove', thing: item.name, consequence: 'The act leaves this line-up, with any credits for it.', button: 'Remove act' })) return
  if (await act(() => $api(`${base.value}/${item.id}` as string, { method: 'DELETE', body: {} }), 'Act removed')) await refreshNuxtData(`core:production:${props.productionId}:credits:${props.performance.id}`)
}

// Order: the list is redrawn at once and the saved order follows.
const moved = ref('')
async function place(from: number, to: number) {
  if (to < 0 || to >= items.value.length || from === to) return
  const list = [...items.value]
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item!)
  if (data.value) data.value = { items: list }
  const after = to === 0 ? null : list[to - 1]!.id
  const ok = await act(() => $api(`${base.value}/${item!.id}/move` as string, { method: 'PUT', body: { after } }))
  if (ok) moved.value = `${item!.name} is now ${to + 1} of ${list.length}`
}
async function onHandleKey(event: KeyboardEvent, index: number) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const id = items.value[index]!.id
  const keepFocus = () => document.querySelector<HTMLElement>(`[data-drag-handle="${id}"]`)?.focus()
  const saving = place(index, index + by)
  await nextTick()
  keepFocus()
  await saving
  await nextTick()
  keepFocus()
}
const actions = (item: Item, i: number): DropdownMenuItem[][] => [
  [{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => start(item) }],
  [
    { label: 'Move up', icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => { void place(i, i - 1) } },
    { label: 'Move down', icon: 'i-lucide-arrow-down', disabled: i === items.value.length - 1, onSelect: () => { void place(i, i + 1) } },
  ],
  [{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void remove(item) } }],
]
</script>

<template>
  <div class="space-y-6">
    <PageSection
      title="Line-up"
      description="The acts at this performance, in running order. An act that is one of the theatre's own productions links to its page, and its page says it appears here."
    >
      <template #actions>
        <UButton
          label="Add act"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          @click="start()"
        />
      </template>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <div class="space-y-3">
          <RefusalNotice
            v-if="!open"
            :refusal="refusal"
          />
          <EmptyState
            v-if="!items.length"
            icon="i-lucide-list-ordered"
            title="No line-up"
            description="Add acts when this performance is a showcase, a double bill or a festival programme."
          />
          <SortableList
            v-else
            label="Line-up"
            @reorder="({ from, to }) => place(from, to)"
          >
            <SortableRow
              v-for="(item, i) in items"
              :id="item.id"
              :key="item.id"
              :index="i"
              :icon="item.production ? 'i-lucide-theater' : 'i-lucide-mic-vocal'"
              :name="item.name"
              :description="describe(item)"
              :muted="!item.announced"
            >
              <template #leading>
                <IconButton
                  v-if="items.length > 1"
                  :data-drag-handle="item.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="`Drag to move ${item.name}`"
                  aria-describedby="line-up-order-help"
                  @keydown="onHandleKey($event, i)"
                />
              </template>
              <StatusBadge
                v-if="!item.announced"
                tone="neutral"
                label="Not announced"
              />
              <RowActions
                :items="actions(item, i)"
                :label="`Actions for ${item.name}`"
              />
            </SortableRow>
          </SortableList>
          <span
            id="line-up-order-help"
            class="sr-only"
          >Press the up or down arrow to move this act, or drag it.</span>
          <span
            class="sr-only"
            aria-live="polite"
          >{{ moved }}</span>
        </div>
      </DataBoundary>
    </PageSection>

    <ProductionCredits
      :production-id="productionId"
      :credits-public="creditsPublic"
      :performance-id="performance.id"
      :acts="acts"
    />

    <UModal
      v-model:open="open"
      :title="editing ? 'Edit act' : 'Add act'"
      :description="`At the performance on ${dates.dayNamed(performance.startsAt)}, ${dates.time(performance.startsAt)} to ${dates.time(performance.endsAt)}.`"
    >
      <template #body>
        <UForm
          id="line-up-form"
          ref="lineUpForm"
          :state="form"
          :validate="() => needs({ name: form.name || form.production?.label })"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            v-if="!editing"
            label="Production"
            help="Optional. Choose one of the theatre's productions, or just give the act a name."
          >
            <UInputMenu
              v-model="form.production"
              v-model:search-term="search"
              :items="productionItems"
              :loading="searching"
              ignore-filter
              placeholder="Search productions"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="name"
            label="Name"
            help="As it should be printed."
            required
          >
            <UInput
              v-model="form.name"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="note"
            label="Note"
            help="Optional, shown beside the name. Such as “with the Year 2 band”."
          >
            <UInput
              v-model="form.note"
              maxlength="200"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="startsAt"
              label="Set time"
              help="Optional. Within the performance."
            >
              <UInputTime
                :model-value="timeValue(form.time)"
                :hour-cycle="24"
                @update:model-value="form.time = $event ? String($event).slice(0, 5) : ''"
              />
            </UFormField>
            <UFormField
              name="minutes"
              label="Length"
              help="Optional."
            >
              <DurationInput
                v-model="form.seconds"
                min="1m"
                max="10h"
                :units="['hour', 'minute']"
                label="Length"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.announced"
            label="Announce it"
            description="Shown on the public page. Leave unticked for a surprise guest or an act not yet confirmed."
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="open = false"
          />
          <UButton
            type="submit"
            form="line-up-form"
            :label="editing ? 'Save act' : 'Add act'"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
