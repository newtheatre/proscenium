<!-- The Record page type (UI-12). The title is the thing's own name with its status as a badge that
     always carries a word; one primary action for the likeliest next step and the rest in a menu
     (destructive last); a strip of four to six facts above the tabs that stays put as they change;
     the owner's own tabs first, then tabs other modules add through `core.record-tab` (absent when
     the viewer may not open them or the module is off); and a history panel from the audit trail. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

export interface RecordTab { id: string, label: string }

const props = withDefaults(defineProps<{
  title: string
  /** Always a word, never colour alone. */
  status?: { label: string, tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
  /** The most likely next step in this state. */
  primary?: { label: string, to?: string, icon?: string }
  /** Everything else, destructive actions last. */
  actions?: DropdownMenuItem[][]
  /** Four to six facts. */
  summary?: { label: string, value: string }[]
  /** The record's type, such as `core.production`, and its id: what other modules' tabs and the history attach to. */
  recordType: string
  recordId: string
  /** The owner's own tabs; each one's contents go in the slot `tab-<id>`. */
  tabs: RecordTab[]
}>(), { status: undefined, primary: undefined, actions: () => [], summary: () => [] })
const emit = defineEmits<{ (e: 'primary'): void }>()

const { t } = useT()
const route = useRoute()
const router = useRouter()

interface Contributed { id: string, labelKey: string, component: string, count?: number }
const { data: contributed } = await useFetch<{ tabs: Contributed[] }>('/api/core/record-tabs', { query: { record: props.recordType }, key: `core:record-tabs:${props.recordType}`, default: () => ({ tabs: [] }) })

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

const historyOpen = ref(false)
const history = ref<{ at: number, who: string | null, kind: string, action: string, ability: string | null, detail: Record<string, unknown> }[] | null>(null)
const historyFailed = ref(false)
watch(historyOpen, async (open) => {
  if (!open || history.value) return
  historyFailed.value = false
  try {
    history.value = (await $fetch<{ entries: NonNullable<typeof history.value> }>('/api/core/history', { query: { type: props.recordType, id: props.recordId } })).entries
  }
  catch {
    historyFailed.value = true
  }
})
const when = (at: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(at)
const actionName = (action: string) => (te(`core.history.action.${action}`) ? t(`core.history.action.${action}`) : action)
const { te } = useT()
</script>

<template>
  <PageFrame :title="title">
    <template #status>
      <StatusBadge
        v-if="status"
        :tone="status.tone"
        :label="status.label"
      />
    </template>
    <template #primary>
      <UButton
        v-if="primary"
        :label="primary.label"
        :icon="primary.icon"
        :to="primary.to"
        @click="!primary.to && emit('primary')"
      />
      <UButton
        icon="i-lucide-history"
        color="neutral"
        variant="outline"
        :label="t('core.history.open')"
        @click="historyOpen = true"
      />
      <UDropdownMenu
        v-if="actions.length"
        :items="actions"
      >
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="outline"
          :aria-label="t('core.record.more-actions', { name: title })"
        />
      </UDropdownMenu>
    </template>

    <dl
      v-if="summary.length"
      class="mb-6 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-default p-4 sm:grid-cols-3 lg:grid-cols-6"
    >
      <div
        v-for="fact in summary"
        :key="fact.label"
      >
        <dt class="text-xs text-muted">
          {{ fact.label }}
        </dt>
        <dd class="font-medium text-highlighted">
          {{ fact.value }}
        </dd>
      </div>
    </dl>

    <UTabs
      v-model="current"
      :items="items"
      :content="false"
      class="mb-4"
    />
    <div
      role="tabpanel"
      :aria-label="items.find(i => i.value === current)?.label"
    >
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
        <ol
          v-else-if="history"
          class="space-y-4"
        >
          <li
            v-for="(entry, i) in history"
            :key="i"
          >
            <p class="font-medium">
              {{ actionName(entry.action) }}
            </p>
            <p class="text-sm text-muted">
              {{ entry.who ?? t('core.history.system') }} · {{ when(entry.at) }}
            </p>
          </li>
        </ol>
        <p v-else>
          {{ t('core.history.loading') }}
        </p>
      </template>
    </USlideover>
  </PageFrame>
</template>
