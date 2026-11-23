<script setup lang="ts">
import { RecordList, RecordListItem, SortableList, SortableRow } from '#components'

// One vocabulary (C-20, C-21), on a module's Lists tab or under Admin > Lists: its terms in order,
// each with the count of records that use it. A record stores the term's id, so a rename reaches all.

interface Term { id: string, slug: string, label: string, description: string | null, icon: string | null, seeded: boolean, retired: boolean, mergedIntoId: string | null, groupId: string | null, uses: number }
interface Vocabulary { key: string, owner: string, label: string, description: string | null, ordering: 'manual' | 'alphabetical', locked: boolean, grouped: boolean }
interface Heading { id: string, label: string, terms: number }

const { t } = useT()
const { $api } = useNuxtApp()
const props = defineProps<{ listKey: string, trail: { label: string, to: string }[] }>()
const emit = defineEmits<{ loaded: [vocabulary: Vocabulary] }>()
const key = computed(() => props.listKey)
const base = computed(() => `/api/core/vocabularies/${encodeURIComponent(key.value)}`)
const { data, status, error, refresh } = await useAPI<{ vocabulary: Vocabulary, groups: Heading[], terms: Term[] }>(base, { key: `core:vocabulary:${key.value}` })
watch(() => data.value?.vocabulary, (v) => { if (v) emit('loaded', v) }, { immediate: true })
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const live = computed(() => data.value?.terms.filter(t => !t.retired) ?? [])
const retired = computed(() => data.value?.terms.filter(t => t.retired) ?? [])
const grouped = computed(() => !!data.value?.vocabulary.grouped)
const headings = computed(() => data.value?.groups ?? [])
const headingItems = computed(() => headings.value.map(h => ({ value: h.id, label: h.label })))
// A grouped vocabulary lists its terms under their headings; any other as one list.
const sections = computed(() => grouped.value
  ? headings.value.map(h => ({ id: h.id, label: h.label as string | null, terms: live.value.filter(t => t.groupId === h.id) }))
  : [{ id: '', label: null as string | null, terms: live.value }])
const locked = computed(() => !!data.value?.vocabulary.locked)
const manual = computed(() => data.value?.vocabulary.ordering === 'manual')
// One call to the vocabulary's routes. The path is built at run time, so it is typed as a string.
function api(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: object = {}): Promise<unknown> {
  return $api<unknown>(`${base.value}${path}` as string, { method, body })
}
const labelOf = (id: string | null) => data.value?.terms.find(t => t.id === id)?.label ?? ''

// Says what was done, with an Undo where the act has a reverse.
async function run(fn: () => Promise<unknown>, done?: string, undo?: () => Promise<unknown>) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    if (done && undo) {
      offer(done, async () => {
        await undo()
        await refresh()
      })
    }
    else if (done) {
      toast.add({ title: done, color: 'success' })
    }
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return false
  }
}

const adding = reactive({ label: '', groupId: '' })
// The add box says what it lacks when pressed, in place of a dimmed button.
function checkNew() {
  const missing = needs({ label: adding.label })
  if (missing.length || !grouped.value || adding.groupId) return missing
  return [{ name: 'label', message: t('core.list.choose-heading') }]
}
async function add() {
  const label = adding.label.trim()
  if (label && await run(() => api('/terms', 'POST', { label, ...(grouped.value ? { groupId: adding.groupId } : {}) }), t('core.list.added', { label }))) adding.label = ''
}

// Headings (C-54)
const addingHeading = reactive({ label: '' })
async function addHeading() {
  const label = addingHeading.label.trim()
  if (label && await run(() => api('/groups', 'POST', { label }), t('core.list.heading-added', { label }))) addingHeading.label = ''
}
const editingHeading = ref<string | null>(null)
const editHeading = reactive({ label: '' })
async function saveHeading(h: Heading) {
  const label = editHeading.label.trim()
  if (!label || label === h.label) return (editingHeading.value = null)
  if (await run(() => api(`/groups/${h.id}`, 'PATCH', { label }), t('core.list.renamed', { label }), () => api(`/groups/${h.id}`, 'PATCH', { label: h.label }))) editingHeading.value = null
}
// The list is put in its new order at once and saved behind; a refusal reloads the order that stands.
async function moveHeading(h: Heading, to: number) {
  const next = [...headings.value]
  const from = next.findIndex(x => x.id === h.id)
  if (from < 0 || to < 0 || to >= next.length || from === to) return
  next.splice(to, 0, next.splice(from, 1)[0]!)
  data.value!.groups = next
  if (!await run(() => api('/groups/order', 'PUT', { ids: next.map(x => x.id) }))) await refresh()
}
async function removeHeading(h: Heading) {
  if (!await confirm({ verb: t('core.list.remove'), thing: t('core.list.the-heading', { label: h.label }), consequence: t('core.list.remove-consequence'), button: t('core.list.remove-heading') })) return
  await run(() => api(`/groups/${h.id}`, 'DELETE'), t('core.list.heading-removed', { label: h.label }))
}
function startEditHeading(h: Heading) {
  editingHeading.value = h.id
  editHeading.label = h.label
}
const headingActions = (h: Heading, at: number) => [[
  { label: t('core.list.rename'), icon: 'i-lucide-pencil', onSelect: () => startEditHeading(h) },
  { label: t('core.list.move-up'), icon: 'i-lucide-arrow-up', disabled: at === 0, onSelect: () => moveHeading(h, at - 1) },
  { label: t('core.list.move-down'), icon: 'i-lucide-arrow-down', disabled: at === headings.value.length - 1, onSelect: () => moveHeading(h, at + 1) },
  ...(locked.value || h.terms > 0 ? [] : [{ label: t('core.list.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeHeading(h) }]),
]]

const editing = ref<string | null>(null)
const edit = reactive({ label: '', groupId: '' })
function startEdit(term: Term) {
  editing.value = term.id
  edit.label = term.label
  edit.groupId = term.groupId ?? ''
}
async function saveEdit(term: Term) {
  const label = edit.label.trim()
  const moved = grouped.value && edit.groupId && edit.groupId !== term.groupId
  if (!label || (label === term.label && !moved)) return (editing.value = null)
  const back = { label: term.label, ...(moved && term.groupId ? { groupId: term.groupId } : {}) }
  if (await run(() => api(`/terms/${term.id}`, 'PATCH', { label, ...(moved ? { groupId: edit.groupId } : {}) }), moved ? t('core.list.moved', { label }) : t('core.list.renamed', { label }), () => api(`/terms/${term.id}`, 'PATCH', back))) editing.value = null
}

// A term moves among those it is listed with (its heading's, in a grouped list); the rest keep their places.
async function move(term: Term, to: number) {
  const beside = (grouped.value ? live.value.filter(t => t.groupId === term.groupId) : live.value)
  const from = beside.findIndex(t => t.id === term.id)
  if (from < 0 || to < 0 || to >= beside.length || from === to) return
  const order = [...beside]
  order.splice(to, 0, order.splice(from, 1)[0]!)
  const places = new Set(beside.map(t => t.id))
  const next = data.value!.terms.map(t => places.has(t.id) ? order.shift()! : t)
  data.value!.terms = next
  if (!await run(() => api('/order', 'PUT', { ids: next.map(t => t.id) }))) await refresh()
}
// On a handle the arrow keys move the row one place, and the handle keeps the focus.
async function onHandleKey(event: KeyboardEvent, id: string, at: number, moveTo: (to: number) => Promise<void>) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const focus = () => document.querySelector<HTMLElement>(`[data-drag-handle="${id}"]`)?.focus()
  const saving = moveTo(at + by)
  await nextTick()
  focus()
  await saving
  await nextTick()
  focus()
}

const retire = (term: Term) => run(() => api(`/terms/${term.id}/retire`, 'POST'), t('core.list.retired-toast', { label: term.label }), () => api(`/terms/${term.id}/restore`, 'POST'))
const restore = (term: Term) => run(() => api(`/terms/${term.id}/restore`, 'POST'), t('core.list.restored-toast', { label: term.label }), () => api(`/terms/${term.id}/retire`, 'POST'))
const showRetired = ref(false)

async function remove(term: Term) {
  if (!await confirm({ verb: t('core.list.delete'), thing: t('core.list.the-term', { label: term.label }), consequence: t('core.list.delete-consequence'), button: t('core.list.delete-term') })) return
  await run(() => api(`/terms/${term.id}`, 'DELETE'), t('core.list.deleted', { label: term.label }))
}

const orderHelp = t('core.list.order-help')
const uses = (term: Term) => t('core.counts.records', { count: term.uses })

const actions = (term: Term, at: number, of: number) => [[
  { label: t('core.list.rename'), icon: 'i-lucide-pencil', onSelect: () => startEdit(term) },
  ...(manual.value
    ? [
        { label: t('core.list.move-up'), icon: 'i-lucide-arrow-up', disabled: at === 0, onSelect: () => move(term, at - 1) },
        { label: t('core.list.move-down'), icon: 'i-lucide-arrow-down', disabled: at === of - 1, onSelect: () => move(term, at + 1) },
      ]
    : []),
  ...(locked.value ? [] : [{ label: t('core.list.retire'), icon: 'i-lucide-archive', onSelect: () => retire(term) }]),
  ...(locked.value || term.uses > 0 || (term.seeded && data.value?.vocabulary.owner !== 'theatre') ? [] : [{ label: t('core.list.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(term) }]),
]]
</script>

<template>
  <PageFrame
    :title="data?.vocabulary.label ?? t('core.list.list')"
    :description="data?.vocabulary.description ?? undefined"
    :trail="trail"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="locked"
        tone="neutral"
        :label="t('core.list.locked')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <RefusalNotice :refusal="refusal" />

      <PageSection
        v-if="grouped"
        :title="t('core.list.headings')"
        :description="t('core.list.description-terms-sit-under')"
      >
        <UForm
          v-if="!locked"
          :state="addingHeading"
          :validate="() => needs({ heading: addingHeading.label })"
          :validate-on="[]"
          novalidate
          @submit="addHeading"
        >
          <UFormField name="heading">
            <UFieldGroup class="flex">
              <UInput
                v-model="addingHeading.label"
                :placeholder="t('core.list.new-heading')"
                :aria-label="t('core.list.new-heading')"
                maxlength="80"
                class="flex-1"
              />
              <UButton
                type="submit"
                :label="t('core.list.add-heading')"
                icon="i-lucide-plus"
              />
            </UFieldGroup>
          </UFormField>
        </UForm>
        <SortableList
          :label="t('core.list.headings')"
          @reorder="m => headings[m.from]?.id === m.id && moveHeading(headings[m.from]!, m.to)"
        >
          <SortableRow
            v-for="(h, hIndex) in headings"
            :id="h.id"
            :key="h.id"
            :index="hIndex"
            :name="h.label"
            :description="t('core.counts.terms', { count: h.terms })"
          >
            <template
              v-if="editingHeading === h.id"
              #name
            >
              <UForm
                :state="editHeading"
                novalidate
                @submit="saveHeading(h)"
              >
                <UFieldGroup class="flex">
                  <UInput
                    v-model="editHeading.label"
                    name="heading-label"
                    :aria-label="t('core.list.heading')"
                    maxlength="80"
                    class="flex-1"
                    autofocus
                    @keydown.esc="editingHeading = null"
                  />
                  <UButton
                    type="submit"
                    :label="t('core.list.save')"
                  />
                </UFieldGroup>
              </UForm>
            </template>
            <template #leading>
              <IconButton
                :data-drag-handle="h.id"
                icon="i-lucide-grip-vertical"
                size="sm"
                class="cursor-grab touch-none"
                :label="t('core.list.move', { label: h.label })"
                aria-describedby="vocabulary-heading-order-help"
                @keydown="onHandleKey($event, h.id, hIndex, to => moveHeading(h, to))"
              />
            </template>
            <RowActions
              :items="headingActions(h, hIndex)"
              :label="t('core.list.actions-for', { label: h.label })"
            />
          </SortableRow>
        </SortableList>
        <p
          v-if="headings.length > 1"
          id="vocabulary-heading-order-help"
          class="text-sm text-muted"
        >
          {{ orderHelp }}
        </p>
      </PageSection>

      <PageSection
        :title="t('core.list.terms')"
        :description="locked ? t('core.list.terms-help-locked') : t('core.list.terms-help')"
      >
        <UForm
          v-if="!locked"
          :state="adding"
          :validate="checkNew"
          :validate-on="[]"
          novalidate
          @submit="add"
        >
          <UFormField name="label">
            <UFieldGroup class="flex">
              <UInput
                v-model="adding.label"
                :placeholder="t('core.list.new-term')"
                :aria-label="t('core.list.new-term')"
                maxlength="80"
                class="flex-1"
              />
              <USelect
                v-if="grouped"
                v-model="adding.groupId"
                :items="headingItems"
                :placeholder="t('core.list.heading')"
                :aria-label="t('core.list.heading-for-the-new')"
              />
              <UButton
                type="submit"
                :label="t('core.list.add-term')"
                icon="i-lucide-plus"
              />
            </UFieldGroup>
          </UFormField>
        </UForm>
        <p
          v-if="!live.length"
          class="text-sm text-muted"
        >
          {{ locked ? t('core.list.no-terms-locked') : t('core.list.no-terms') }}
        </p>

        <template
          v-for="section in sections"
          :key="section.id"
        >
          <h3
            v-if="section.label"
            class="mt-4 text-sm font-semibold text-highlighted"
          >
            {{ section.label }}
          </h3>
          <p
            v-if="section.label && !section.terms.length"
            class="text-sm text-muted"
          >
            {{ t('core.list.none-under-heading') }}
          </p>
          <component
            :is="manual ? SortableList : RecordList"
            v-if="section.terms.length"
            :label="section.label ? t('core.list.terms-under', { heading: section.label }) : t('core.list.terms')"
            @reorder="(m: { id: string, from: number, to: number }) => section.terms[m.from]?.id === m.id && move(section.terms[m.from]!, m.to)"
          >
            <component
              :is="manual ? SortableRow : RecordListItem"
              v-for="(term, index) in section.terms"
              :id="manual ? term.id : undefined"
              :key="term.id"
              :index="manual ? index : undefined"
              :icon="term.icon ?? undefined"
              :name="term.label"
              :description="uses(term)"
            >
              <template
                v-if="editing === term.id"
                #name
              >
                <UForm
                  :state="edit"
                  novalidate
                  @submit="saveEdit(term)"
                >
                  <UFieldGroup class="flex">
                    <UInput
                      v-model="edit.label"
                      name="label"
                      :aria-label="t('core.list.label')"
                      maxlength="80"
                      class="flex-1"
                      autofocus
                      @keydown.esc="editing = null"
                    />
                    <USelect
                      v-if="grouped"
                      v-model="edit.groupId"
                      :items="headingItems"
                      :aria-label="t('core.list.heading')"
                    />
                    <UButton
                      type="submit"
                      :label="t('core.list.save')"
                    />
                  </UFieldGroup>
                </UForm>
              </template>
              <template
                v-if="manual"
                #leading
              >
                <IconButton
                  :data-drag-handle="term.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('core.list.move', { label: term.label })"
                  aria-describedby="vocabulary-order-help"
                  @keydown="onHandleKey($event, term.id, index, to => move(term, to))"
                />
              </template>
              <RowActions
                :items="actions(term, index, section.terms.length)"
                :label="t('core.list.actions-for', { label: term.label })"
              />
            </component>
          </component>
        </template>
        <p
          v-if="manual && live.length > 1"
          id="vocabulary-order-help"
          class="text-sm text-muted"
        >
          {{ orderHelp }}
        </p>
        <CollapsibleDivider
          v-model:open="showRetired"
          :label="t('core.list.retired')"
          :count="retired.length"
        >
          <p class="mb-3 text-sm text-muted">
            {{ t('core.list.retired-help') }}
          </p>
          <RecordList :label="t('core.list.retired-terms')">
            <RecordListItem
              v-for="term in retired"
              :key="term.id"
              :name="term.mergedIntoId ? t('core.list.merged-into', { label: term.label, into: labelOf(term.mergedIntoId) }) : term.label"
              :description="uses(term)"
              muted
            >
              <UButton
                v-if="!term.mergedIntoId && !locked"
                :label="t('core.list.restore')"
                color="neutral"
                variant="outline"
                size="sm"
                :aria-label="t('core.list.restore-named', { label: term.label })"
                @click="restore(term)"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </PageSection>
    </DataBoundary>
  </PageFrame>
</template>
