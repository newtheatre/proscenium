<!-- Merges (identity spec part 6, ID-32): recent merges, newest first, with where each stands. A
     complete merge can be undone while its window lasts; the rows move back in the background and
     the two accounts part at the end. A merge unfinished for more than a day names the modules still
     holding it up, and an undone one says what a module could not put back. -->
<script setup lang="ts">
import type { RefusalView } from '../../../utils/refusal'

definePageMeta({ layout: 'console' })

type State = 'moving' | 'complete' | 'undoing' | 'undone' | 'closed'
interface Merge {
  id: string
  survivor: { id: string, name: string | null }
  merged: { id: string, name: string | null }
  startedBy: 'person' | 'staff' | 'claim'
  performedAt: number
  undoUntil: number
  state: State
  undoable: boolean
  waitingOn: string[]
  notRestored: { handler: string, count: number, reason: string | null }[]
}

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ merges: Merge[] }>('/api/core/accounts/merges', { key: 'core:merges' })

// Merges is reached from Accounts, so it leads back there for anyone who may open Accounts.
const { data: navigation } = await useNavigation('console')
const trail = computed(() => navigation.value?.groups.some(g => g.everyday.some(e => e.id === 'core.people'))
  ? [{ label: t('core.navigation.people.label'), to: '/console/people' }]
  : undefined)

const { dateTime: when } = useDates()
const nameOf = (a: { name: string | null }) => a.name ?? t('core.merges.unnamed')
const TONE: Record<State, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { moving: 'info', complete: 'success', undoing: 'info', undone: 'neutral', closed: 'neutral' }
const refusal = ref<RefusalView | null>(null)
const undoing = ref<string | null>(null)

async function undo(merge: Merge) {
  if (!await confirm({
    verb: t('core.merges.undo'),
    thing: t('core.merges.thing', { merged: nameOf(merge.merged), survivor: nameOf(merge.survivor) }),
    consequence: t('core.merges.undo-consequence'),
    button: t('core.merges.undo-button'),
  })) return
  undoing.value = merge.id
  refusal.value = null
  try {
    await $api(`/api/core/accounts/merges/${merge.id}/undo` as '/api/core/accounts/merges/:id/undo', { method: 'POST', body: {} })
    toast.add({ title: t('core.merges.undo-started'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    undoing.value = null
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.navigation.merges.label')"
    :description="t('core.merges.intro')"
    :trail="trail"
  >
    <template #primary>
      <UButton
        icon="i-lucide-merge"
        to="/console/people/merge"
        :label="t('core.merges.merge-accounts')"
      />
    </template>
    <div class="space-y-6">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <EmptyState
          v-if="data && !data.merges.length"
          icon="i-lucide-merge"
          :title="t('core.merges.empty')"
          :description="t('core.merges.empty-description')"
        />
        <RecordList
          v-else-if="data"
          :label="t('core.navigation.merges.label')"
        >
          <RecordListItem
            v-for="m in data.merges"
            :key="m.id"
            icon="i-lucide-merge"
            :muted="m.state === 'undone'"
          >
            <template #name>
              {{ t('core.merges.thing', { merged: nameOf(m.merged), survivor: nameOf(m.survivor) }) }}
            </template>
            <template #description>
              <span class="block">{{ t(`core.merges.by.${m.startedBy}`, { date: when(m.performedAt) }) }}</span>
              <span
                v-if="m.undoable"
                class="block"
              >{{ t('core.merges.undo-until', { date: when(m.undoUntil) }) }}</span>
              <span
                v-if="m.waitingOn.length"
                class="block text-warning"
              >{{ t('core.merges.waiting-on', { modules: m.waitingOn.join(', ') }) }}</span>
              <span
                v-for="kept in m.notRestored"
                :key="kept.handler"
                class="block text-warning"
              >{{ t('core.merges.not-restored', { count: kept.count, handler: kept.handler }) }}<template v-if="kept.reason && te(kept.reason)">: {{ t(kept.reason) }}</template></span>
            </template>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <StatusBadge
                :tone="m.waitingOn.length ? 'warning' : TONE[m.state]"
                :label="t(`core.merges.state.${m.state}`)"
              />
              <UButton
                v-if="m.undoable"
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-undo-2"
                :loading="undoing === m.id"
                :label="t('core.merges.undo')"
                @click="undo(m)"
              />
            </div>
          </RecordListItem>
        </RecordList>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
