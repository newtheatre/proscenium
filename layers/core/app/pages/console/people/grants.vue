<!-- Who holds what (Identity Doc part 5; ID-23, ID-24): every grant in force, waiting or about to
     lapse, with its holder, role, reach and end. Ended grants are a view away. Give a role, renew
     several at once or end one, when the viewer manages grants. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { grantsList } from '../../../../shared/identity-lists'
import type { GrantOptions } from '../../../components/GiveRoleDialog.vue'

definePageMeta({ layout: 'console' })

type State = 'live' | 'pending' | 'lapsing' | 'ended'
interface Row { id: string, accountId: string, person: string, roleId: string, role: string, scope: { kind: 'site' | 'module' | 'record', module: string | null }, ends: number | null, endedAt: number | null, state: State }

const { t } = useT()
const { $api } = useNuxtApp()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { day } = useDates()
const { data: options } = await useAPI<GrantOptions>('/api/core/grants/options', { key: 'core:grants:options', default: () => ({ roles: [], modules: [], manage: false, yearEnd: null, allowNoExpiry: false }) })
const giving = ref(false)
// ?give=1 (the command palette's Give a role) opens the dialogue for someone who may give roles; the
// flag is then dropped, so going back or reloading does not open it again.
const route = useRoute()
onMounted(() => {
  if (route.query.give === undefined) return
  if (options.value?.manage) giving.value = true
  void navigateTo({ query: { ...route.query, give: undefined } }, { replace: true })
})

const TONES = { live: 'success', pending: 'info', lapsing: 'warning', ended: 'neutral' } as const
const stateLabel = (state: State) => t(`core.grants.state.${state}`)
const moduleLabel = (id: string) => t(`${id}.module.name`)
const reach = (row: Row) => row.scope.kind === 'site' ? t('core.grants.scope.site') : row.scope.kind === 'module' ? moduleLabel(row.scope.module!) : t('core.grants.scope.record-in', { module: moduleLabel(row.scope.module!) })

const list = computed(() => ({
  ...grantsList,
  filters: {
    state: { ...grantsList.filters.state, label: t('core.grants.column.state'), options: grantsList.filters.state.options.map(o => ({ value: o.value, label: stateLabel(o.value as State) })) },
    role: { ...grantsList.filters.role, label: t('core.grants.column.role') },
    scope: { ...grantsList.filters.scope, label: t('core.grants.column.scope'), options: grantsList.filters.scope.options.map(o => ({ value: o.value, label: t(`core.grants.scope.${o.value}`) })) },
    module: { ...grantsList.filters.module, label: t('core.grants.module') },
  },
  sorts: { ends: { ...grantsList.sorts.ends, label: t('core.grants.column.ends') } },
  columns: Object.fromEntries(Object.entries(grantsList.columns).map(([key, c]) => [key, { ...c, label: t(`core.grants.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(grantsList.views).map(([key, v]) => [key, { ...v, label: t(`core.grants.view.${key}`) }])),
}))
const filterOptions = computed(() => ({
  role: (options.value?.roles ?? []).map(r => ({ value: r.id, label: r.name })),
  module: (options.value?.modules ?? []).map(m => ({ value: m, label: moduleLabel(m) })),
}))

const listKey = ref(0)
async function run(work: () => Promise<unknown>, done: string) {
  try {
    await work()
    toast.add({ title: done, color: 'success' })
    listKey.value++
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
async function end(row: Row) {
  if (!await confirm({ verb: t('core.grants.end.verb'), thing: t('core.grants.end.thing', { role: row.role, person: row.person }), consequence: t('core.grants.end.consequence'), button: t('core.grants.end.button') })) return
  const path: string = `/api/core/grants/${encodeURIComponent(row.id)}/end`
  await run(() => $api<unknown>(path, { method: 'POST', body: {} }), t('core.grants.end.done'))
}
const rowActions = (row: Row): DropdownMenuItem[] => options.value?.manage && row.state !== 'ended'
  ? [{ label: t('core.grants.end.button'), icon: 'i-lucide-circle-stop', color: 'error', onSelect: () => { void end(row) } }]
  : []
const RENEW: string = '/api/core/grants/renew'
const bulkActions = computed(() => options.value?.manage
  ? [{ label: t('core.grants.renew'), icon: 'i-lucide-refresh-cw', run: (rows: Row[]) => run(() => $api<unknown>(RENEW, { method: 'POST', body: { grantIds: rows.map(r => r.id) } }), t('core.grants.renewed', { count: rows.length })) }]
  : undefined)
</script>

<template>
  <PageList
    :key="listKey"
    :title="t('core.navigation.grants.label')"
    route="/api/core/grants/held"
    :list="list"
    :filter-options="filterOptions"
    :row-label="(row: Row) => t('core.grants.row', { role: row.role, person: row.person })"
    :row-to="(row: Row) => `/console/people/${encodeURIComponent(row.accountId)}`"
    :row-actions="rowActions"
    :bulk-actions="bulkActions"
    :empty="{ title: t('core.grants.empty.title'), description: t('core.grants.empty.description'), icon: 'i-lucide-key-round' }"
  >
    <template
      v-if="options?.manage"
      #primary
    >
      <UButton
        icon="i-lucide-user-plus"
        :label="t('core.grants.give.open')"
        @click="giving = true"
      />
    </template>
    <template #cell-person="{ row }">
      {{ row.person }}
    </template>
    <template #cell-role="{ row }">
      {{ row.role }}
    </template>
    <template #cell-scope="{ row }">
      {{ reach(row) }}
    </template>
    <template #cell-ends="{ row }">
      {{ row.endedAt ? t('core.grants.ended-on', { day: day(row.endedAt) }) : row.ends ? day(row.ends) : t('core.grants.no-end') }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="stateLabel(row.state)"
      />
    </template>
    <GiveRoleDialog
      v-if="options?.manage"
      v-model:open="giving"
      :options="options"
      @changed="refreshNuxtData('core:list:/api/core/grants/held')"
    />
  </PageList>
</template>
