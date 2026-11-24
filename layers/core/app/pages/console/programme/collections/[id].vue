<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// One collection (C-60) as a record page: its details, and its productions in the order its public
// page shows them, dragged or moved from the keyboard. Bound to a season, it takes only that season's
// productions (CL1). Publishing needs a production; going back to draft, that none is published.
type State = 'draft' | 'published' | 'archived'
interface Member { id: string, title: string, state: string, seasonId: string | null, firstStartsAt: number | null, lastEndsAt: number | null, sort: number }
interface Collection { id: string, slug: string, name: string, summary: string | null, description: string | null, colour: string, seasonId: string | null, season: string | null, state: State, productions: number, members: Member[] }
interface Season { id: string, name: string, state: State }
interface Choice { id: string, label: string }

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { $api } = useNuxtApp()
const dates = useDates()
const { data, status, error, refresh } = await useAPI<Collection>(() => `/api/core/collections/${id.value}`, { key: `core:collection:${id.value}` })
const { data: seasons } = await useAPI<{ rows: Season[] }>('/api/core/seasons', { key: 'core:seasons', query: { size: 100 } })
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const TONES = { draft: 'neutral', published: 'success', archived: 'info' } as const
const collection = computed(() => data.value ?? null)
const members = computed(() => data.value?.members ?? [])
const ANY = 'any' // the season select's value for a collection open to any season

async function run(fn: () => Promise<unknown>, done?: string, undo?: () => Promise<unknown>, form?: { setErrors: (errors: { name: string, message: string }[]) => void } | null) {
  refusal.value = null
  try {
    await fn()
    await refresh()
    if (done) offer(done, undo && (async () => {
      await undo()
      await refresh()
    }))
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form?.setErrors(fieldErrors(refusal.value))
    return false
  }
}

// State
const shift = (to: State) => $api(`/api/core/collections/${id.value}/state` as string, { method: 'POST', body: { to } })
const move = (to: State, done: string) => {
  const from = collection.value!.state
  return run(() => shift(to), done, () => shift(from))
}
const publicPath = computed(() => collection.value ? `/collections/${collection.value.slug}` : '')
const primary = computed(() => {
  const c = collection.value
  if (!c) return undefined
  if (c.state === 'draft') return { label: t('core.collections.publish'), icon: 'i-lucide-globe', hint: members.value.length ? undefined : t('core.collections.publish-hint') }
  if (c.state === 'published') return { label: t('core.collections.view-public'), icon: 'i-lucide-external-link', to: publicPath.value }
  return { label: t('core.collections.restore'), icon: 'i-lucide-archive-restore' }
})
function onPrimary() {
  const c = collection.value
  if (c?.state === 'draft') void move('published', t('core.collections.published'))
  else if (c?.state === 'archived') void move('published', t('core.collections.restored'))
}
async function remove() {
  const c = collection.value!
  if (!await confirm({ verb: t('core.collections.delete'), thing: c.name, consequence: t('core.collections.delete-consequence'), button: t('core.collections.delete-button') })) return
  refusal.value = null
  try {
    await $api(`/api/core/collections/${id.value}` as string, { method: 'DELETE', body: {} })
    await navigateTo('/console/programme/collections')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const actions = computed<DropdownMenuItem[][]>(() => {
  const c = collection.value
  if (!c) return []
  return [
    [
      ...(c.state === 'published' ? [{ label: t('core.collections.to-draft'), icon: 'i-lucide-undo-2', onSelect: () => { void move('draft', t('core.collections.back-to-draft')) } }] : []),
      ...(c.state !== 'archived' ? [{ label: t('core.collections.archive'), icon: 'i-lucide-archive', onSelect: () => { void move('archived', t('core.collections.archived-done')) } }] : []),
    ],
    ...(c.state === 'draft' ? [[{ label: t('core.collections.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { void remove() } }]] : []),
  ]
})
const summary = computed(() => collection.value
  ? [
      { label: t('core.collections.season'), value: collection.value.season ?? t('core.collections.any-season') },
      { label: t('core.collections.productions'), value: String(members.value.length) },
      { label: t('core.collections.address'), value: publicPath.value },
    ]
  : [])
const tabs = computed(() => [{ id: 'productions', label: t('core.collections.productions') }, { id: 'details', label: t('core.collections.details') }])

// Details
const details = reactive({ name: '', slug: '', colour: '', seasonId: ANY, summary: '', description: '' })
watch(collection, (c) => {
  if (c) Object.assign(details, { name: c.name, slug: c.slug, colour: c.colour, seasonId: c.seasonId ?? ANY, summary: c.summary ?? '', description: c.description ?? '' })
}, { immediate: true })
const seasonItems = computed(() => [
  { value: ANY, label: t('core.collections.any-season') },
  ...(seasons.value?.rows ?? []).filter(s => s.state !== 'archived' || s.id === collection.value?.seasonId).map(s => ({ value: s.id, label: s.name })),
])
const detailsForm = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('detailsForm')
async function saveDetails() {
  const before = collection.value!
  const body = { name: details.name, slug: details.slug, colour: details.colour, seasonId: details.seasonId === ANY ? null : details.seasonId, summary: details.summary, description: details.description }
  const back = { name: before.name, colour: before.colour, seasonId: before.seasonId, summary: before.summary ?? '', description: before.description ?? '' }
  await run(() => $api(`/api/core/collections/${id.value}` as string, { method: 'PATCH', body }), t('core.collections.saved'), () => $api(`/api/core/collections/${id.value}` as string, { method: 'PATCH', body: back }), detailsForm.value)
}

// Productions: added from a search, in this collection's season when it has one.
const picked = ref<Choice | undefined>()
const { search, found, searching } = useProductionSearch({
  query: () => collection.value?.seasonId ? { seasonId: collection.value.seasonId } : {},
  keep: id => !members.value.some(m => m.id === id),
})
async function addMember() {
  const p = picked.value
  if (!p) return
  const ok = await run(() => $api(`/api/core/collections/${id.value}/productions` as string, { method: 'POST', body: { productionIds: [p.id] } }), t('core.collections.added-production', { title: p.label }),
    () => $api(`/api/core/collections/${id.value}/productions` as string, { method: 'DELETE', body: { productionIds: [p.id] } }))
  if (ok) {
    picked.value = undefined
    search.value = ''
  }
}
async function removeMember(m: Member) {
  await run(() => $api(`/api/core/collections/${id.value}/productions` as string, { method: 'DELETE', body: { productionIds: [m.id] } }), t('core.collections.removed-production', { title: m.title }),
    () => $api(`/api/core/collections/${id.value}/productions` as string, { method: 'POST', body: { productionIds: [m.id] } }))
}

const moved = ref('')
async function place(from: number, to: number) {
  if (to < 0 || to >= members.value.length || from === to) return
  const list = [...members.value]
  const [m] = list.splice(from, 1)
  list.splice(to, 0, m!)
  if (data.value) data.value = { ...data.value, members: list }
  const ok = await run(() => $api(`/api/core/collections/${id.value}/productions` as string, { method: 'PUT', body: { productionIds: list.map(x => x.id) } }))
  if (ok) moved.value = t('core.collections.moved', { title: m!.title, place: to + 1, count: list.length })
}
async function onHandleKey(event: KeyboardEvent, index: number) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const key = members.value[index]!.id
  const keepFocus = () => document.querySelector<HTMLElement>(`[data-drag-handle="${key}"]`)?.focus()
  const saving = place(index, index + by)
  await nextTick()
  keepFocus()
  await saving
  await nextTick()
  keepFocus()
}
const memberActions = (m: Member, i: number): DropdownMenuItem[][] => [
  [{ label: t('core.collections.open-production'), icon: 'i-lucide-drama', to: `/console/programme/productions/${m.id}` }],
  [
    { label: t('core.collections.move-up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => { void place(i, i - 1) } },
    { label: t('core.collections.move-down'), icon: 'i-lucide-arrow-down', disabled: i === members.value.length - 1, onSelect: () => { void place(i, i + 1) } },
  ],
  [{ label: t('core.collections.remove-production'), icon: 'i-lucide-x', color: 'error' as const, onSelect: () => { void removeMember(m) } }],
]
const describeMember = (m: Member) => [
  t(`core.states.${m.state}`),
  m.firstStartsAt ? (m.lastEndsAt ? dates.range(m.firstStartsAt, m.lastEndsAt) : dates.day(m.firstStartsAt)) : t('core.collections.no-dates'),
].join(' · ')
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <PageRecord
      v-if="collection"
      :title="collection.name"
      :status="{ label: t(`core.states.${collection.state}`), tone: TONES[collection.state] }"
      :primary="primary"
      :actions="actions"
      :summary="summary"
      record-type="core.collection"
      :record-id="collection.id"
      :tabs="tabs"
      :trail="[{ label: t('core.collections.title'), to: '/console/programme/collections' }]"
      :checklist="false"
      @primary="onPrimary"
    >
      <template #tab-productions>
        <PageSection
          :title="t('core.collections.productions')"
          :description="collection.seasonId ? t('core.collections.productions-bound', { season: collection.season ?? '' }) : t('core.collections.productions-help')"
        >
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <div class="flex flex-wrap items-end gap-2">
              <UFormField
                :label="t('core.collections.add-production')"
                class="min-w-64 grow"
              >
                <UInputMenu
                  v-model="picked"
                  v-model:search-term="search"
                  :items="found"
                  :loading="searching"
                  ignore-filter
                  :placeholder="t('core.collections.search-productions')"
                />
              </UFormField>
              <UButton
                :label="t('core.collections.add')"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                :disabled="!picked"
                loading-auto
                @click="addMember()"
              />
            </div>
            <EmptyState
              v-if="!members.length"
              icon="i-lucide-drama"
              :title="t('core.collections.no-productions')"
              :description="t('core.collections.no-productions-description')"
            />
            <SortableList
              v-else
              :label="t('core.collections.productions')"
              @reorder="({ from, to }) => place(from, to)"
            >
              <SortableRow
                v-for="(m, i) in members"
                :id="m.id"
                :key="m.id"
                :index="i"
                :name="m.title"
                :description="describeMember(m)"
                :muted="m.state !== 'published'"
              >
                <template #leading>
                  <IconButton
                    v-if="members.length > 1"
                    :data-drag-handle="m.id"
                    icon="i-lucide-grip-vertical"
                    size="sm"
                    class="cursor-grab touch-none"
                    :label="t('core.collections.drag', { title: m.title })"
                    aria-describedby="collection-order-help"
                    @keydown="onHandleKey($event, i)"
                  />
                </template>
                <RowActions
                  :items="memberActions(m, i)"
                  :label="t('core.collections.actions-for', { title: m.title })"
                />
              </SortableRow>
            </SortableList>
            <span
              id="collection-order-help"
              class="sr-only"
            >{{ t('core.collections.order-help') }}</span>
            <span
              class="sr-only"
              aria-live="polite"
            >{{ moved }}</span>
          </div>
        </PageSection>
      </template>

      <template #tab-details>
        <PageSection :title="t('core.collections.details')">
          <UForm
            id="collection-details"
            ref="detailsForm"
            :state="details"
            :validate="() => needs({ name: details.name, slug: details.slug, colour: details.colour })"
            class="space-y-4"
            novalidate
            @submit="saveDetails"
          >
            <RefusalNotice :refusal="refusal" />
            <UFormField
              name="name"
              :label="t('core.collections.name')"
              required
            >
              <UInput
                v-model="details.name"
                maxlength="80"
              />
            </UFormField>
            <UFormField
              name="slug"
              :label="t('core.collections.address')"
              :help="t('core.collections.address-help')"
              required
            >
              <UInput
                v-model="details.slug"
                maxlength="60"
              >
                <template #leading>
                  <span class="text-sm text-muted">/collections/</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField
              name="colour"
              :label="t('core.collections.colour')"
              :help="t('core.collections.colour-help')"
              required
            >
              <div class="flex flex-wrap items-center gap-3">
                <FieldColour v-model="details.colour" />
                <CollectionChip
                  v-if="/^#[0-9a-f]{6}$/i.test(details.colour)"
                  :name="details.name || t('core.collections.preview')"
                  :colour="details.colour"
                />
              </div>
            </UFormField>
            <UFormField
              name="seasonId"
              :label="t('core.collections.season')"
              :help="t('core.collections.season-help')"
            >
              <USelect
                v-model="details.seasonId"
                :items="seasonItems"
              />
            </UFormField>
            <UFormField
              name="summary"
              :label="t('core.collections.summary')"
              :help="t('core.collections.summary-help')"
            >
              <UTextarea
                v-model="details.summary"
                :rows="2"
                maxlength="300"
              />
            </UFormField>
            <UFormField
              name="description"
              :label="t('core.collections.page')"
              :help="t('core.collections.page-help')"
            >
              <UTextarea
                v-model="details.description"
                :rows="8"
                maxlength="5000"
              />
            </UFormField>
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="collection-details"
              :label="t('core.collections.save')"
            />
          </template>
        </PageSection>
      </template>
    </PageRecord>
  </DataBoundary>
</template>
