<!-- Checklists (Front of house specification, part 5, "Console"): the lists worked through on the
     night, such as opening the house, with their items in order. An item can ask for a reading, such
     as a fridge's temperature. A run keeps the items it started with, so changing a list is safe. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type Moment = 'pre-show' | 'post-show' | 'other'
interface Item {
  id?: string
  label: string
  help: string | null
  kind: 'tick' | 'reading'
  unit: string | null
  required: boolean
}
type FormItem = Omit<Item, 'unit'> & { unit: string, key: string }
interface Checklist {
  id: string
  name: string
  moment: Moment
  venueId: string | null
  dutyId: string | null
  archivedAt: number | null
  items: Item[]
}
interface Choices {
  venues: { id: string, name: string }[]
  duties: { id: string, name: string }[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const undo = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ checklists: Checklist[], archived?: Checklist[] }>('/api/front-of-house/checklists', { key: 'front-of-house:checklists' })
const { data: choices } = await useAPI<Choices>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const ANY = 'any'
const moments = computed(() => (['pre-show', 'post-show', 'other'] as const).map(value => ({ value, label: t(`front-of-house.checklists.moment.${value}`) })))
const kinds = computed(() => (['tick', 'reading'] as const).map(value => ({ value, label: t(`front-of-house.checklists.kind.${value}`) })))
const venueItems = computed(() => [{ value: ANY, label: t('front-of-house.any-venue') }, ...(choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const dutyItems = computed(() => [{ value: ANY, label: t('front-of-house.checklists.any-duty') }, ...(choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name }))])
const venueName = (id: string | null) => id ? choices.value?.venues.find(v => v.id === id)?.name ?? '' : t('front-of-house.any-venue')

// A row's own key for dragging: its id once saved, made here until then.
const blankItem = (): FormItem => ({ key: crypto.randomUUID(), label: '', help: null, kind: 'tick', unit: '', required: true })
const blank = () => ({ name: '', moment: 'pre-show' as Moment, venueId: ANY, dutyId: ANY, items: [blankItem()] })
const form = ref(blank())
const editing = ref<Checklist | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const open = ref(false)

function edit(list: Checklist) {
  editing.value = list
  form.value = { name: list.name, moment: list.moment, venueId: list.venueId ?? ANY, dutyId: list.dutyId ?? ANY, items: list.items.map(i => ({ ...i, key: i.id ?? crypto.randomUUID(), unit: i.unit ?? '' })) }
  refusal.value = null
  open.value = true
}
function add() {
  editing.value = null
  form.value = blank()
  refusal.value = null
  open.value = true
}
function move(from: number, to: number) {
  const items = form.value.items
  if (to < 0 || to >= items.length || from === to) return
  items.splice(to, 0, ...items.splice(from, 1))
}
// Arrow keys on the handle move the row and keep the focus on it.
async function onHandleKey(event: KeyboardEvent, key: string) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const at = form.value.items.findIndex(x => x.key === key)
  move(at, at + by)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-drag-handle="${key}"]`)?.focus()
}

async function save() {
  refusal.value = null
  const f = form.value
  const body = {
    name: f.name.trim(),
    moment: f.moment,
    venueId: f.venueId === ANY ? null : f.venueId,
    dutyId: f.dutyId === ANY ? null : f.dutyId,
    items: f.items.filter(i => i.label.trim()).map(i => ({ ...(i.id ? { id: i.id } : {}), label: i.label.trim(), help: i.help?.trim() || null, kind: i.kind, unit: i.kind === 'reading' ? i.unit.trim() || null : null, required: i.required })),
  }
  try {
    if (editing.value) await write(`/api/front-of-house/checklists/${encodeURIComponent(editing.value.id)}`, { method: 'PUT', body })
    else await write('/api/front-of-house/checklists', { method: 'POST', body })
    toast.add({ title: t(editing.value ? 'front-of-house.checklists.saved' : 'front-of-house.checklists.added', { name: body.name }), color: 'success' })
    open.value = false
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Archiving asks nothing first: it is undone from its own toast, or later from the archived list.
async function setArchived(list: Checklist, archived: boolean) {
  refusal.value = null
  const call = (to: boolean) => write(`/api/front-of-house/checklists/${encodeURIComponent(list.id)}/${to ? 'archive' : 'restore'}`, { method: 'POST', body: {} })
  try {
    await call(archived)
    undo.offer(t(archived ? 'front-of-house.checklists.archived' : 'front-of-house.checklists.restored', { name: list.name }), async () => {
      await call(!archived)
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const showArchived = ref(false)

const actions = (list: Checklist): DropdownMenuItem[][] => [
  [{ label: t('front-of-house.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(list) }],
  [{ label: t('front-of-house.archive.button'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void setArchived(list, true) } }],
]
const fhChecklistForm = useFormRef('fhChecklistForm')
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.checklists.label')"
    :description="t('front-of-house.checklists.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('front-of-house.checklists.add-button')"
        @click="add"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice
        v-if="!open"
        :refusal="refusal"
      />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <div class="space-y-4">
            <EmptyState
              v-if="!d.checklists.length"
              :title="t('front-of-house.checklists.empty.title')"
              :description="t('front-of-house.checklists.empty.description')"
              icon="i-lucide-list-checks"
            />
            <RecordList
              v-else
              :label="t('front-of-house.navigation.checklists.label')"
            >
              <RecordListItem
                v-for="list in d.checklists"
                :key="list.id"
                :name="list.name"
                :description="[t(`front-of-house.checklists.moment.${list.moment}`), venueName(list.venueId), t('front-of-house.checklists.items', { count: list.items.length })].join(' · ')"
              >
                <RowActions
                  :items="actions(list)"
                  :label="t('front-of-house.actions-for', { name: list.name })"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('front-of-house.archived.label')"
              :count="d.archived?.length ?? 0"
            >
              <RecordList :label="t('front-of-house.checklists.archived-list')">
                <RecordListItem
                  v-for="list in d.archived"
                  :key="list.id"
                  :name="list.name"
                  :description="[t(`front-of-house.checklists.moment.${list.moment}`), venueName(list.venueId), t('front-of-house.checklists.items', { count: list.items.length })].join(' · ')"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('front-of-house.restore.button')"
                    :aria-label="t('front-of-house.restore.named', { name: list.name })"
                    loading-auto
                    @click="setArchived(list, false)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? t('front-of-house.checklists.edit-title', { name: editing.name }) : t('front-of-house.checklists.add-title')"
    >
      <template #body>
        <UForm
          id="fh-checklist"
          ref="fhChecklistForm"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('front-of-house.checklists.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField :label="t('front-of-house.checklists.when')">
              <USelect
                v-model="form.moment"
                :items="moments"
                value-key="value"
              />
            </UFormField>
            <UFormField :label="t('front-of-house.venue')">
              <USelectMenu
                v-model="form.venueId"
                :items="venueItems"
                value-key="value"
              />
            </UFormField>
            <UFormField :label="t('front-of-house.checklists.duty')">
              <USelectMenu
                v-model="form.dutyId"
                :items="dutyItems"
                value-key="value"
              />
            </UFormField>
          </div>
          <FieldGroup :title="t('front-of-house.checklists.items-legend')">
            <SortableList
              :label="t('front-of-house.checklists.items-legend')"
              @reorder="m => move(m.from, m.to)"
            >
              <SortableRow
                v-for="(item, i) in form.items"
                :id="item.key"
                :key="item.key"
                :index="i"
                :name="t('front-of-house.checklists.item', { n: i + 1 })"
              >
                <template #leading>
                  <IconButton
                    :data-drag-handle="item.key"
                    icon="i-lucide-grip-vertical"
                    size="sm"
                    class="cursor-grab touch-none"
                    :label="t('front-of-house.checklists.order-handle', { n: i + 1 })"
                    aria-describedby="fh-checklist-order-help"
                    @keydown="onHandleKey($event, item.key)"
                  />
                </template>
                <IconButton
                  icon="i-lucide-arrow-up"
                  color="neutral"
                  variant="ghost"
                  :label="t('front-of-house.checklists.move-up', { n: i + 1 })"
                  :disabled="i === 0"
                  @click="move(i, i - 1)"
                />
                <IconButton
                  icon="i-lucide-arrow-down"
                  color="neutral"
                  variant="ghost"
                  :label="t('front-of-house.checklists.move-down', { n: i + 1 })"
                  :disabled="i === form.items.length - 1"
                  @click="move(i, i + 1)"
                />
                <IconButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  :label="t('front-of-house.checklists.remove-item', { n: i + 1 })"
                  @click="form.items.splice(i, 1)"
                />
                <template #below>
                  <UInput
                    v-model="item.label"
                    maxlength="160"
                    class="mb-3"
                    :aria-label="t('front-of-house.checklists.item-words', { n: i + 1 })"
                  />
                  <div class="grid gap-3 sm:grid-cols-3">
                    <UFormField :label="t('front-of-house.checklists.kind-label')">
                      <USelect
                        v-model="item.kind"
                        :items="kinds"
                        value-key="value"
                      />
                    </UFormField>
                    <UFormField
                      v-if="item.kind === 'reading'"
                      :label="t('front-of-house.checklists.unit')"
                    >
                      <UInput
                        v-model="item.unit"
                        maxlength="20"
                      />
                    </UFormField>
                    <UCheckbox
                      v-model="item.required"
                      :label="t('front-of-house.checklists.required')"
                      class="self-end"
                    />
                  </div>
                </template>
              </SortableRow>
            </SortableList>
            <span
              id="fh-checklist-order-help"
              class="sr-only"
            >{{ t('front-of-house.checklists.order-keys') }}</span>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :label="t('front-of-house.checklists.add-item')"
              @click="form.items.push(blankItem())"
            />
          </FieldGroup>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          :loading="fhChecklistForm?.loading"
          form="fh-checklist"
          :label="editing ? t('front-of-house.save') : t('front-of-house.checklists.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
