<!-- The Record page type (UI-12). The title is the thing's own name with its status as a badge that
     always carries a word; one primary action for the likeliest next step and the rest in a menu
     (destructive last); a strip of four to six facts above the tabs that stays put as they change;
     the owner's own tabs first, then tabs other modules add through `core.record-tab` (absent when
     the viewer may not open them or the module is off); and a history panel from the audit trail. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

export interface RecordTab { id: string, label: string }

const { $api } = useNuxtApp()
const props = withDefaults(defineProps<{
  title: string
  /** Always a word, never colour alone. */
  status?: { label: string, tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
  /** The most likely next step in this state; `hint` says why it is not ready yet, and it then shows quieter. */
  primary?: { label: string, to?: string, icon?: string, hint?: string }
  /** Everything else, destructive actions last. */
  actions?: DropdownMenuItem[][]
  /** Four to six facts. */
  summary?: { label: string, value: string, to?: string }[]
  /** The record's type, such as `core.production`, and its id: what other modules' tabs and the history attach to. */
  recordType: string
  recordId: string
  /** The owner's own tabs; each one's contents go in the slot `tab-<id>`. With only one tab in all, no tab bar is drawn. */
  tabs: RecordTab[]
  /** Where this record sits below a navigation entry, nearest parent last. */
  trail?: { label: string, to: string }[]
  /** What the readiness checklist is called, when other modules or the owner contribute checks. */
  checklistTitle?: string
  /** False once the checklist has nothing left to say, such as on a published production. */
  checklist?: boolean
  /** On a phone, the side panel follows the tabs when it is reference and not the work (a poster). */
  asideBelow?: boolean
}>(), { trail: undefined, checklistTitle: undefined, checklist: true, asideBelow: false, status: undefined, primary: undefined, actions: () => [], summary: () => [] })
const emit = defineEmits<{ (e: 'primary'): void }>()
defineSlots<{
  /** A side panel that stays put beside the tabs on a laptop (a poster); above them on a phone. */
  aside?: () => unknown
  [tab: `tab-${string}`]: () => unknown
}>()

const { t } = useT()
const route = useRoute()
const router = useRouter()

interface Contributed { id: string, labelKey: string, component: string, count?: number }
const { data: contributed } = await useAPI<{ tabs: Contributed[] }>('/api/core/record-tabs', { query: { record: props.recordType }, key: `core:record-tabs:${props.recordType}`, default: () => ({ tabs: [] }) })

// A component no one answers to is left out rather than breaking the page.
const others = computed(() => (contributed.value?.tabs ?? []).flatMap((c) => {
  const component = resolveComponent(c.component)
  return typeof component === 'string' ? [] : [{ ...c, component }]
}))
const items = computed(() => [
  ...props.tabs.map(tab => ({ label: tab.label, value: tab.id })),
  ...others.value.map(o => ({ label: t(o.labelKey), value: o.id, badge: o.count })),
])
const current = computed({
  get: () => (items.value.some(i => i.value === route.query.tab) ? String(route.query.tab) : items.value[0]?.value),
  set: (value) => { void router.replace({ query: { ...route.query, tab: value } }) },
})
const contributedNow = computed(() => others.value.find(o => o.id === current.value))

// Facts and checklist lines other modules add (R-35): read-only, gated by ability, absent when their module is off.
const { data: factList } = await useAPI<{ facts: { id: string, component: string }[] }>('/api/core/record-facts', { query: { record: props.recordType }, key: `core:record-facts:${props.recordType}`, default: () => ({ facts: [] }) })
const facts = computed(() => (factList.value?.facts ?? []).flatMap((f) => {
  const component = resolveComponent(f.component)
  return typeof component === 'string' ? [] : [{ ...f, component }]
}))
const { data: checkList } = await useAPI<{ checks: { id: string, done: boolean, sentence: string, link?: string, needed?: boolean }[] }>('/api/core/record-checks', { query: { record: props.recordType, id: props.recordId }, key: `core:record-checks:${props.recordType}:${props.recordId}`, default: () => ({ checks: [] }) })
const checks = computed(() => props.checklist ? checkList.value?.checks ?? [] : [])
const checksDone = computed(() => checks.value.filter(c => c.done).length)
const hasAside = computed(() => !!slots.aside || checks.value.length > 0)
const slots = useSlots()

const historyOpen = ref(false)
const history = ref<{ at: number, who: string | null, kind: string, action: string, ability: string | null, detail: Record<string, unknown> }[] | null>(null)
const historyFailed = ref(false)
watch(historyOpen, async (open) => {
  if (!open || history.value) return
  historyFailed.value = false
  try {
    history.value = (await $api<{ entries: NonNullable<typeof history.value> }>('/api/core/history', { query: { type: props.recordType, id: props.recordId } })).entries
  }
  catch {
    historyFailed.value = true
  }
})
const { dateTime: when } = useDates()
const actionName = (action: string) => (te(`core.history.action.${action}`) ? t(`core.history.action.${action}`) : action)
// What happened, who did it and when, newest first as the server gives them. A person's change has
// a person's icon and the system's own a cog, so the two can be told apart down the line.
const timeline = computed(() => (history.value ?? []).map((entry, i) => ({
  value: i,
  title: actionName(entry.action),
  description: entry.who ?? t('core.history.system'),
  date: when(entry.at),
  icon: entry.who ? 'i-lucide-user' : 'i-lucide-cog',
})))
const { te } = useT()
</script>

<template>
  <PageFrame
    :title="title"
    :trail="trail"
    long-title
  >
    <template #status>
      <StatusBadge
        v-if="status"
        :tone="status.tone"
        :label="status.label"
      />
    </template>
    <template #primary>
      <UTooltip
        v-if="primary"
        :text="primary.hint"
        :disabled="!primary.hint"
      >
        <UButton
          :label="primary.label"
          :icon="primary.icon"
          :to="primary.to"
          :variant="primary.hint ? 'outline' : 'solid'"
          :aria-description="primary.hint"
          @click="!primary.to && emit('primary')"
        />
      </UTooltip>
      <UButton
        icon="i-lucide-history"
        color="neutral"
        variant="outline"
        :label="t('core.history.open')"
        :ui="{ label: 'max-sm:sr-only' }"
        @click="historyOpen = true"
      />
      <RowActions
        :items="actions"
        :label="t('core.record.more-actions', { name: title })"
        variant="outline"
        size="md"
      />
    </template>

    <FactStrip
      v-if="summary.length || facts.length"
      :facts="summary"
      framed
      row
      class="mb-6"
    >
      <component
        :is="f.component"
        v-for="f in facts"
        :key="f.id"
        :record-id="recordId"
      />
    </FactStrip>

    <div :class="hasAside ? 'max-lg:flex max-lg:flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-8' : ''">
      <!-- On a phone the side panel folds to one line above the tabs, so the poster does not push the work down. -->
      <aside
        v-if="hasAside"
        class="mb-4 lg:order-2"
        :class="asideBelow && !checks.length && 'max-lg:order-last max-lg:mt-6'"
        :aria-label="t('core.record.side-panel')"
      >
        <!-- Both are drawn and CSS picks one, so the server and the browser draw the same markup. -->
        <UCollapsible
          v-if="checks.length"
          class="mb-3 lg:hidden"
        >
          <UButton
            color="neutral"
            variant="outline"
            class="w-full justify-between"
            trailing-icon="i-lucide-chevron-down"
            :label="`${checklistTitle ?? t('core.record.checklist')}: ${t('core.record.checks-done', { done: checksDone, total: checks.length })}`"
          />
          <template #content>
            <RecordChecks
              :checks="checks"
              :title="checklistTitle ?? t('core.record.checklist')"
            />
          </template>
        </UCollapsible>
        <div :class="['space-y-4', checks.length && 'max-lg:hidden']">
          <slot name="aside" />
          <RecordChecks
            v-if="checks.length"
            :checks="checks"
            :title="checklistTitle ?? t('core.record.checklist')"
          />
        </div>
      </aside>
      <div class="min-w-0 lg:order-1">
        <!-- Page-level tabs look the same everywhere (a module's page in Admin, the settings window):
             underlined, each label in full, scrolling sideways when they do not fit. A record with only one tab draws no bar. -->
        <UTabs
          v-if="items.length > 1"
          v-model="current"
          :items="items"
          :content="false"
          variant="link"
          :aria-label="t('core.record.tabs', { name: title })"
          :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
          class="mb-4"
        />
        <div
          :role="items.length > 1 ? 'tabpanel' : undefined"
          :aria-label="items.length > 1 ? items.find(i => i.value === current)?.label : undefined"
        >
          <!-- A tab of its own boundary: one whose content waits for data keeps the last tab in view
               until it is ready, and never unsettles the page around it. -->
          <Suspense>
            <div :key="current">
              <component
                :is="contributedNow.component"
                v-if="contributedNow"
                :record-id="recordId"
              />
              <slot
                v-else
                :name="`tab-${current}`"
              />
            </div>
          </Suspense>
        </div>
      </div>
    </div>

    <USlideover
      v-model:open="historyOpen"
      :title="t('core.history.title')"
      :description="t('core.history.description')"
    >
      <template #body>
        <p
          v-if="historyFailed"
          role="alert"
        >
          {{ t('core.history.unavailable') }}
        </p>
        <EmptyState
          v-else-if="history && !history.length"
          :title="t('core.history.empty')"
          icon="i-lucide-history"
        />
        <UTimeline
          v-else-if="history"
          :items="timeline"
          color="neutral"
          size="xs"
        />
        <p v-else>
          {{ t('core.history.loading') }}
        </p>
      </template>
    </USlideover>
  </PageFrame>
</template>
