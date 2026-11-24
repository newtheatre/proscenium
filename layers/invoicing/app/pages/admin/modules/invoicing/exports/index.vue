<!-- Export profiles (S10; IE-02): each says how a file is laid out and which code each ledger account
     goes out under. A new one starts from the journal or the students' union return; archived ones
     sit below a divider. -->
<script setup lang="ts">
interface ProfileItem { id: string, name: string, format: 'journal' | 'custom', granularity: 'entry' | 'daily', columns: number, archived: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<{ profiles: ProfileItem[], defaultProfileId: string | null, canSetDefault: boolean }>('/api/invoicing/exports/profiles', { key: 'invoicing:export-profiles' })
const live = computed(() => (data.value?.profiles ?? []).filter(p => !p.archived))
const archived = computed(() => (data.value?.profiles ?? []).filter(p => p.archived))
const showArchived = ref(false)
const newForm = useFormRef('newForm')

const open = ref(false)
const form = reactive({ name: '', starter: 'journal' as 'journal' | 'union' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openNew() {
  Object.assign(form, { name: '', starter: 'journal' })
  refusal.value = null
  open.value = true
}
async function create() {
  refusal.value = null
  try {
    const { id } = await $api<{ id: string }>('/api/invoicing/exports/profiles', { method: 'POST', body: { starter: form.starter, name: form.name || undefined } })
    open.value = false
    await navigateTo(`/admin/modules/invoicing/exports/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function setArchived(p: ProfileItem, value: boolean) {
  try {
    await $api(`/api/invoicing/exports/profiles/${p.id}`, { method: 'PATCH', body: { archived: value } })
    await refresh()
    offer(t(value ? 'invoicing.screens.profiles.archived-toast' : 'invoicing.screens.profiles.restored-toast', { name: p.name }), async () => {
      await $api(`/api/invoicing/exports/profiles/${p.id}`, { method: 'PATCH', body: { archived: !value } })
      await refresh()
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
async function makeDefault(p: ProfileItem) {
  try {
    await $api(`/api/invoicing/exports/profiles/${p.id}/default`, { method: 'POST', body: {} })
    await refresh()
    toast.add({ title: t('invoicing.screens.profiles.default-toast', { name: p.name }), color: 'success' })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
const describe = (p: ProfileItem) => [t(`invoicing.screens.profiles.formats.${p.format}`), t(`invoicing.screens.profiles.granularity.${p.granularity}`)].join(' · ')
const actions = (p: ProfileItem) => [
  ...(!p.archived && data.value?.canSetDefault && data.value.defaultProfileId !== p.id ? [{ label: t('invoicing.screens.profiles.make-default'), icon: 'i-lucide-star', onSelect: () => makeDefault(p) }] : []),
  p.archived
    ? { label: t('invoicing.screens.profiles.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setArchived(p, false) }
    : { label: t('invoicing.screens.profiles.archive'), icon: 'i-lucide-archive', onSelect: () => setArchived(p, true) },
]
</script>

<template>
  <PageFrame
    :title="t('invoicing.navigation.export-profiles.label')"
    :description="t('invoicing.screens.profiles.help')"
  >
    <template #primary>
      <UButton
        :label="t('invoicing.screens.profiles.new')"
        icon="i-lucide-plus"
        @click="openNew"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!live.length && !archived.length"
        :title="t('invoicing.screens.profiles.none')"
        :description="t('invoicing.screens.profiles.none-help')"
        icon="i-lucide-file-cog"
        :action="{ label: t('invoicing.screens.profiles.new'), icon: 'i-lucide-plus', onClick: openNew }"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList :label="t('invoicing.navigation.export-profiles.label')">
          <RecordListItem
            v-for="p in live"
            :key="p.id"
            :to="`/admin/modules/invoicing/exports/${p.id}`"
            :name="p.name"
            :description="describe(p)"
          >
            <StatusBadge
              v-if="data?.defaultProfileId === p.id"
              tone="info"
              :label="t('invoicing.screens.profiles.default')"
            />
            <template #trailing>
              <RowActions
                :label="t('invoicing.screens.profiles.actions', { name: p.name })"
                :items="actions(p)"
              />
            </template>
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          v-model:open="showArchived"
          :label="t('invoicing.screens.profiles.archived')"
          :count="archived.length"
        />
        <RecordList
          v-if="showArchived && archived.length"
          :label="t('invoicing.screens.profiles.archived')"
        >
          <RecordListItem
            v-for="p in archived"
            :key="p.id"
            :to="`/admin/modules/invoicing/exports/${p.id}`"
            :name="p.name"
            :description="describe(p)"
            muted
          >
            <template #trailing>
              <RowActions
                :label="t('invoicing.screens.profiles.actions', { name: p.name })"
                :items="actions(p)"
              />
            </template>
          </RecordListItem>
        </RecordList>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('invoicing.screens.profiles.new')"
    >
      <template #body>
        <UForm
          id="export-profile-new"
          ref="newForm"
          :state="form"
          class="space-y-4"
          novalidate
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="starter"
            :label="t('invoicing.screens.profiles.starter')"
            :help="t(`invoicing.screens.profiles.starters.${form.starter}-help`)"
            required
          >
            <USelect
              v-model="form.starter"
              :items="[{ value: 'journal', label: t('invoicing.screens.profiles.starters.journal') }, { value: 'union', label: t('invoicing.screens.profiles.starters.union') }]"
              class="sm:w-80"
            />
          </UFormField>
          <UFormField
            name="name"
            :label="t('invoicing.screens.profiles.name')"
            :hint="t('invoicing.screens.optional')"
            :error="refusal?.fields?.name ? refusal.reason : undefined"
          >
            <UInput
              v-model="form.name"
              maxlength="60"
              :placeholder="t(`invoicing.screens.profiles.starters.${form.starter}`)"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="export-profile-new"
          :loading="newForm?.loading"
          :label="t('invoicing.screens.profiles.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
