<!-- Funds (FR-05): where gifts go, in the order donors see them, one the default for gifts with no
     fund chosen. A restricted fund says what it is for, and stays restricted once it has received
     a gift. Archived funds sit below a divider. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Fund { id: string, name: string, purpose: string | null, restricted: boolean, isDefault: boolean, offered: boolean, state: 'active' | 'archived', received: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { offer } = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ funds: Fund[] }>('/api/fundraising/funds', { key: 'fundraising:funds' })
const live = computed(() => (data.value?.funds ?? []).filter(f => f.state === 'active'))
const archived = computed(() => (data.value?.funds ?? []).filter(f => f.state === 'archived'))
const describe = (f: Fund) => [
  f.isDefault ? t('fundraising.funds.default') : null,
  f.restricted ? t('fundraising.funds.restricted') : null,
  f.offered ? null : t('fundraising.funds.not-offered'),
  f.purpose,
].filter(Boolean).join(' · ')

const editing = ref<Fund | null | undefined>(undefined)
async function change(f: Fund, body: Record<string, unknown>) {
  await $api(`/api/fundraising/funds/${f.id}` as string, { method: 'PATCH', body })
  await refresh()
}
async function attempt(f: Fund, body: Record<string, unknown>, undo?: Record<string, unknown>) {
  try {
    await change(f, body)
    if (undo) offer(t('fundraising.funds.archived-toast', { name: f.name }), () => change(f, undo))
  }
  catch (e) {
    const r = useRefusal().toRefusal(e)
    toast.add({ title: r.reason, description: r.remedy, color: 'error' })
  }
}
const actions = (f: Fund): DropdownMenuItem[] => [
  { label: t('fundraising.funds.edit'), icon: 'i-lucide-pencil', onSelect: () => { editing.value = f } },
  ...(!f.isDefault && f.state === 'active' ? [{ label: t('fundraising.funds.make-default'), icon: 'i-lucide-star', onSelect: () => attempt(f, { isDefault: true }) }] : []),
  ...(f.isDefault
    ? []
    : [f.state === 'archived'
        ? { label: t('fundraising.funds.restore'), icon: 'i-lucide-archive-restore', onSelect: () => attempt(f, { archived: false }) }
        : { label: t('fundraising.funds.archive'), icon: 'i-lucide-archive', onSelect: () => attempt(f, { archived: true }, { archived: false }) }]),
]
</script>

<template>
  <PageFrame
    :title="t('fundraising.navigation.funds.label')"
    :description="t('fundraising.funds.help')"
  >
    <template #primary>
      <PageActions :actions="[{ label: t('fundraising.funds.new'), icon: 'i-lucide-plus', onSelect: () => { editing = null } }]" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RecordList :label="t('fundraising.navigation.funds.label')">
          <RecordListItem
            v-for="f in live"
            :key="f.id"
            icon="i-lucide-piggy-bank"
            :name="f.name"
            :description="describe(f)"
          >
            <RowActions
              :items="actions(f)"
              :label="t('fundraising.funds.actions', { name: f.name })"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('fundraising.funds.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('fundraising.funds.archived')">
            <RecordListItem
              v-for="f in archived"
              :key="f.id"
              icon="i-lucide-piggy-bank"
              :name="f.name"
              :description="describe(f)"
              muted
            >
              <RowActions
                :items="actions(f)"
                :label="t('fundraising.funds.actions', { name: f.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <FundraisingFundDialog
      :fund="editing"
      @close="editing = undefined"
      @saved="refresh()"
    />
  </PageFrame>
</template>
