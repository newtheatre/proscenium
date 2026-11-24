<!-- Purposes (spec part 5): what a room booking may be for, in tier order, where tier 1 wins a
     clash. Each tier's purposes are ordered by dragging or from the keyboard. A purpose in use is
     retired, never deleted, and a new site starts from one of the starting lists (SP-07, SP-08). -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Purpose {
  id: string
  slug: string
  name: string
  description: string | null
  tier: number
  openTo: 'bookers' | 'production-team' | 'staff'
  needsProduction: boolean
  approval: 'automatic' | 'approval'
  maxLengthMinutes: number | null
  maxAheadDays: number | null
  minNoticeMinutes: number | null
  mayRepeat: boolean
  canBeBumped: boolean
  requirements: string[]
  state: 'active' | 'retired'
}
interface Starting { list: string, purposes: { name: string, tier: number, approval: 'automatic' | 'approval' }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const undo = useUndo()
const { data, status, error, refresh } = await useAPI<{ purposes: Purpose[], starting: Starting[], fallbacks: { maxLengthMinutes: number, maxAheadDays: number, minNoticeMinutes: number } }>('/api/spaces/purposes', { key: 'spaces:purposes' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

// Each tier's purposes as shown; a drag moves them here first, then the tier's order is saved.
const byTier = ref<{ tier: number, purposes: Purpose[] }[]>([])
let saving = 0
const draw = () => {
  const active = (data.value?.purposes ?? []).filter(p => p.state === 'active')
  byTier.value = [...new Set(active.map(p => p.tier))].sort((a, b) => a - b).map(tier => ({ tier, purposes: active.filter(p => p.tier === tier) }))
}
watch(() => data.value?.purposes, () => { if (!saving) draw() }, { immediate: true })
const retired = computed(() => (data.value?.purposes ?? []).filter(p => p.state === 'retired'))
const showRetired = ref(false)
const moved = ref('')

async function saveOrder(group: { purposes: Purpose[] }, purpose: Purpose) {
  moved.value = t('spaces.purposes.order.moved', { name: purpose.name, position: group.purposes.indexOf(purpose) + 1, count: group.purposes.length })
  refusal.value = null
  saving++
  try {
    await $api('/api/spaces/purposes/order', { method: 'POST', body: { ids: group.purposes.map(p => p.id) } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving--
  }
  if (saving) return
  await refresh()
  if (!saving) draw()
}
function onReorder(group: { purposes: Purpose[] }, { id, from, to }: { id: string, from: number, to: number }) {
  const next = [...group.purposes]
  const [p] = next.splice(from, 1)
  if (!p || p.id !== id) return
  next.splice(to, 0, p)
  group.purposes = next
  void saveOrder(group, p)
}
function step(group: { purposes: Purpose[] }, purpose: Purpose, by: -1 | 1) {
  const from = group.purposes.indexOf(purpose)
  const to = from + by
  if (from < 0 || to < 0 || to >= group.purposes.length) return
  const next = [...group.purposes]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  group.purposes = next
  void saveOrder(group, purpose)
}
function onHandleKey(event: KeyboardEvent, group: { purposes: Purpose[] }, purpose: Purpose) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  step(group, purpose, event.key === 'ArrowUp' ? -1 : 1)
}

const describe = (p: Purpose) => [
  t(`spaces.purposes.open-to.${p.openTo}`),
  t(`spaces.purposes.approval.${p.approval}`),
  p.canBeBumped ? null : t('spaces.purposes.never-bumped'),
  p.description,
].filter(Boolean).join(' · ')

// ---- The form

const blank = () => ({ name: '', description: '', tier: 5, openTo: 'bookers' as Purpose['openTo'], needsProduction: false, approval: 'automatic' as Purpose['approval'], maxLengthMinutes: null as number | null, maxAheadDays: null as number | null, minNoticeMinutes: null as number | null, mayRepeat: true, canBeBumped: true }) // not-policy: a new purpose's starting values
const form = ref(blank())
const editing = ref<Purpose | null>(null)
const open = ref(false)
const purposeForm = useFormRef('purposeForm')
const tierItems = computed(() => Array.from({ length: 9 }, (_, i) => ({ value: i + 1, label: i === 0 ? t('spaces.purposes.tier-highest', { tier: 1 }) : i === 8 ? t('spaces.purposes.tier-lowest', { tier: 9 }) : String(i + 1) })))
const openToItems = computed(() => (['bookers', 'production-team', 'staff'] as const).map(v => ({ value: v, label: t(`spaces.purposes.open-to.${v}`) })))
const approvalItems = computed(() => (['automatic', 'approval'] as const).map(v => ({ value: v, label: t(`spaces.purposes.approval.${v}`) })))
watch(() => form.value.openTo, (to) => { if (to === 'production-team') form.value.needsProduction = true })

function add() {
  editing.value = null
  form.value = blank()
  refusal.value = null
  open.value = true
}
function edit(p: Purpose) {
  editing.value = p
  form.value = { name: p.name, description: p.description ?? '', tier: p.tier, openTo: p.openTo, needsProduction: p.needsProduction, approval: p.approval, maxLengthMinutes: p.maxLengthMinutes, maxAheadDays: p.maxAheadDays, minNoticeMinutes: p.minNoticeMinutes, mayRepeat: p.mayRepeat, canBeBumped: p.canBeBumped }
  refusal.value = null
  open.value = true
}

async function save() {
  refusal.value = null
  const body = { ...form.value, name: form.value.name.trim(), description: form.value.description.trim() || null, requirements: editing.value?.requirements ?? [] }
  try {
    if (editing.value) await $api(`/api/spaces/purposes/${editing.value.id}`, { method: 'PUT', body })
    else await $api('/api/spaces/purposes', { method: 'POST', body })
    toast.add({ title: t(editing.value ? 'spaces.purposes.saved' : 'spaces.purposes.added', { name: body.name }), color: 'success' })
    open.value = false
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function setRetired(p: Purpose, retire: boolean) {
  refusal.value = null
  const call = (to: boolean) => $api(`/api/spaces/purposes/${p.id}/state`, { method: 'POST', body: { to: to ? 'retired' : 'active' } })
  try {
    await call(retire)
    undo.offer(t(retire ? 'spaces.purposes.retired-toast' : 'spaces.purposes.restored', { name: p.name }), async () => {
      await call(!retire)
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function start(list: string) {
  refusal.value = null
  try {
    const { made } = await $api<{ made: number }>('/api/spaces/purposes/start', { method: 'POST', body: { list } })
    toast.add({ title: t('spaces.purposes.started', { count: made }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const actions = (group: { purposes: Purpose[] }, p: Purpose): DropdownMenuItem[][] => [
  [{ label: t('spaces.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(p) }],
  [
    { label: t('spaces.purposes.order.up'), icon: 'i-lucide-arrow-up', disabled: group.purposes[0] === p, onSelect: () => step(group, p, -1) },
    { label: t('spaces.purposes.order.down'), icon: 'i-lucide-arrow-down', disabled: group.purposes.at(-1) === p, onSelect: () => step(group, p, 1) },
  ],
  [{ label: t('spaces.purposes.retire'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void setRetired(p, true) } }],
]
</script>

<template>
  <PageFrame
    :title="t('spaces.navigation.purposes.label')"
    :description="t('spaces.purposes.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('spaces.purposes.add')"
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
            <template v-if="!d.purposes.length">
              <EmptyState
                :title="t('spaces.purposes.empty.title')"
                :description="t('spaces.purposes.empty.description')"
                icon="i-lucide-list-ordered"
              />
              <div class="grid gap-4 md:grid-cols-3">
                <PageSection
                  v-for="s in d.starting"
                  :key="s.list"
                  :title="t(`spaces.purposes.lists.${s.list}.name`)"
                  :description="t(`spaces.purposes.lists.${s.list}.description`)"
                >
                  <ul class="space-y-1 text-sm">
                    <li
                      v-for="p in s.purposes"
                      :key="p.name"
                      class="flex justify-between gap-2"
                    >
                      <span class="text-highlighted">{{ p.name }}</span>
                      <span class="text-muted">{{ t('spaces.purposes.tier', { tier: p.tier }) }} · {{ t(`spaces.purposes.approval.${p.approval}`) }}</span>
                    </li>
                  </ul>
                  <template #footer>
                    <UButton
                      color="neutral"
                      variant="outline"
                      :label="t('spaces.purposes.use-list')"
                      :aria-label="t('spaces.purposes.use-list-named', { name: t(`spaces.purposes.lists.${s.list}.name`) })"
                      loading-auto
                      @click="start(s.list)"
                    />
                  </template>
                </PageSection>
              </div>
            </template>
            <p
              v-else
              id="purposes-order-help"
              class="text-sm text-muted"
            >
              {{ t('spaces.purposes.order.help') }}
            </p>
            <PageSection
              v-for="group in byTier"
              :key="group.tier"
              :title="t('spaces.purposes.tier', { tier: group.tier })"
            >
              <SortableList
                :label="t('spaces.purposes.tier', { tier: group.tier })"
                @reorder="onReorder(group, $event)"
              >
                <SortableRow
                  v-for="(p, position) in group.purposes"
                  :id="p.id"
                  :key="p.id"
                  :index="position"
                  :name="p.name"
                  :description="describe(p)"
                >
                  <template #leading>
                    <IconButton
                      :data-drag-handle="p.id"
                      icon="i-lucide-grip-vertical"
                      size="sm"
                      class="cursor-grab touch-none"
                      :label="t('spaces.purposes.order.handle', { name: p.name })"
                      aria-describedby="purposes-order-help"
                      @keydown="onHandleKey($event, group, p)"
                    />
                  </template>
                  <RowActions
                    :items="actions(group, p)"
                    :label="t('spaces.purposes.actions-for', { name: p.name })"
                  />
                </SortableRow>
              </SortableList>
            </PageSection>
            <p
              class="sr-only"
              aria-live="polite"
            >
              {{ moved }}
            </p>
            <CollapsibleDivider
              v-model:open="showRetired"
              :label="t('spaces.purposes.retired')"
              :count="retired.length"
            >
              <RecordList :label="t('spaces.purposes.retired')">
                <RecordListItem
                  v-for="p in retired"
                  :key="p.id"
                  :name="p.name"
                  :description="t('spaces.purposes.tier', { tier: p.tier })"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('spaces.purposes.restore')"
                    :aria-label="t('spaces.purposes.restore-named', { name: p.name })"
                    loading-auto
                    @click="setRetired(p, false)"
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
      :title="editing ? t('spaces.purposes.edit-title', { name: editing.name }) : t('spaces.purposes.add')"
    >
      <template #body>
        <UForm
          id="spaces-purpose"
          ref="purposeForm"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('spaces.purposes.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField :label="t('spaces.purposes.about')">
            <UTextarea
              v-model="form.description"
              maxlength="300"
              :rows="2"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('spaces.purposes.tier-label')"
              :help="editing && editing.tier !== form.tier ? t('spaces.purposes.tier-changed') : t('spaces.purposes.tier-help')"
            >
              <USelect
                v-model="form.tier"
                :items="tierItems"
              />
            </UFormField>
            <UFormField :label="t('spaces.purposes.open-to.label')">
              <USelect
                v-model="form.openTo"
                :items="openToItems"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.purposes.approval.label')"
              :help="t('spaces.purposes.approval.help')"
            >
              <USelect
                v-model="form.approval"
                :items="approvalItems"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.needsProduction"
            :disabled="form.openTo === 'production-team'"
            :label="t('spaces.purposes.needs-production')"
            :description="t('spaces.purposes.needs-production-help')"
          />
          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField :label="t('spaces.purposes.max-length')">
              <DefaultedMinutes
                v-model="form.maxLengthMinutes"
                :fallback="data?.fallbacks.maxLengthMinutes"
                :min="15"
                :max="1440"
                :label="t('spaces.purposes.max-length')"
              />
            </UFormField>
            <UFormField :label="t('spaces.purposes.max-ahead')">
              <DefaultedNumber
                v-model="form.maxAheadDays"
                :fallback="data?.fallbacks.maxAheadDays"
                :min="1"
                :max="730"
                :label="t('spaces.purposes.max-ahead')"
              />
            </UFormField>
            <UFormField :label="t('spaces.purposes.min-notice')">
              <DefaultedMinutes
                v-model="form.minNoticeMinutes"
                :fallback="data?.fallbacks.minNoticeMinutes"
                :min="0"
                :max="20160"
                :label="t('spaces.purposes.min-notice')"
              />
            </UFormField>
          </div>
          <UCheckbox
            v-model="form.mayRepeat"
            :label="t('spaces.purposes.may-repeat')"
          />
          <UCheckbox
            v-model="form.canBeBumped"
            :label="t('spaces.purposes.can-be-bumped')"
            :description="t('spaces.purposes.can-be-bumped-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="spaces-purpose"
          :loading="purposeForm?.loading"
          :label="editing ? t('spaces.save') : t('spaces.purposes.add')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
