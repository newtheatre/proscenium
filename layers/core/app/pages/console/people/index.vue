<!-- Accounts (Identity Doc part 5, console People): everyone, searched by name or verified address
     and filtered by state. Unclaimed and erased accounts are hidden unless looked for, through the
     state filter or the views. Someone who gives roles and adds people can invite someone from here. -->
<script setup lang="ts">
import { accountsList } from '../../../../shared/identity-lists'
import type { GrantOptions } from '../../../components/GiveRoleDialog.vue'

definePageMeta({ layout: 'console' })

type State = 'active' | 'unclaimed' | 'disabled' | 'anonymised'
interface Row { id: string, name: string | null, since: number, state: State }

const { t } = useT()
const { day } = useDates()

const TONES = { active: 'success', unclaimed: 'neutral', disabled: 'warning', anonymised: 'neutral' } as const
const stateLabel = (state: State) => t(`core.people.state.${state}`)

// The declaration with the theatre's own words in place of its English fallbacks.
const list = computed(() => ({
  ...accountsList,
  filters: {
    state: {
      ...accountsList.filters.state,
      label: t('core.people.column.state'),
      options: accountsList.filters.state.options.map(o => ({ value: o.value, label: stateLabel(o.value as State) })),
    },
  },
  sorts: { name: { ...accountsList.sorts.name, label: t('core.people.column.name') } },
  columns: Object.fromEntries(Object.entries(accountsList.columns).map(([key, c]) => [key, { ...c, label: t(`core.people.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(accountsList.views).map(([key, v]) => [key, { ...v, label: t(`core.people.view.${key}`) }])),
}))

const route = useRoute()
/** What the state filter left out of this answer, each a link to the view that shows it. */
const hiddenOf = (result: Record<string, unknown>) => {
  const hidden = (result.hidden ?? {}) as { unclaimed?: number, anonymised?: number }
  return (['unclaimed', 'anonymised'] as const).flatMap(view => hidden[view] ? [{ view, count: hidden[view]! }] : [])
}

// Inviting needs Who holds what's options, which only someone who reads grants may ask for: for
// anyone else the answer is a refusal, and there is nothing to offer.
const { $api } = useNuxtApp()
const { data: grantOptions } = await useAsyncData('core:people:grant-options', () => $api<GrantOptions>('/api/core/grants/options').catch(() => null))
const mayInvite = computed(() => !!grantOptions.value?.invite)
const inviting = ref(false)
// ?invite=1 (the command palette's Invite someone) opens the dialogue once the page knows the viewer
// may invite; the flag is then dropped, so going back or reloading does not open it again.
onMounted(() => {
  if (route.query.invite === undefined) return
  if (mayInvite.value) inviting.value = true
  void navigateTo({ query: { ...route.query, invite: undefined } }, { replace: true })
})

const label = (row: Row) => row.state === 'anonymised' ? t('core.people.erased') : (row.name ?? t('core.people.unnamed'))
</script>

<template>
  <PageList
    :title="t('core.navigation.people.label')"
    route="/api/core/people"
    :list="list"
    :row-label="label"
    :row-to="(row: Row) => `/console/people/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('core.people.empty.title'), description: t('core.people.empty.description'), icon: 'i-lucide-users' }"
  >
    <template
      v-if="mayInvite"
      #primary
    >
      <UButton
        icon="i-lucide-mail-plus"
        :label="t('core.grants.invite.open')"
        @click="inviting = true"
      />
    </template>
    <template #note="{ result }">
      <p
        v-if="hiddenOf(result).length"
        class="text-sm text-muted"
      >
        {{ t('core.people.hidden.lead') }}
        <template
          v-for="(part, n) in hiddenOf(result)"
          :key="part.view"
        >
          <span v-if="n">, </span>
          <ULink
            :to="{ query: { ...route.query, view: part.view, page: undefined } }"
            class="underline"
          >{{ t(`core.people.hidden.${part.view}`, { count: part.count }) }}</ULink>
        </template>
      </p>
    </template>
    <template #cell-name="{ row }">
      <span>{{ label(row) }}</span>
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="stateLabel(row.state)"
      />
    </template>
    <template #cell-since="{ row }">
      {{ day(row.since) }}
    </template>
    <GiveRoleDialog
      v-if="mayInvite && grantOptions"
      v-model:open="inviting"
      :options="grantOptions"
      invite
      @changed="refreshNuxtData('core:list:/api/core/people')"
    />
  </PageList>
</template>
