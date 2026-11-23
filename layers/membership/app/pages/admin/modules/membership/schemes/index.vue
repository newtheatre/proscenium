<!-- Membership schemes (MEM-01, MEM-02): every scheme with its kind, state and how many hold it now.
     A new scheme is named, starts as a draft and is set up on its own page. -->
<script setup lang="ts">
interface Scheme { id: string, key: string, name: string, side: 'members' | 'audience', state: 'draft' | 'open' | 'closed' | 'archived', lengthRule: string, holders: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ schemes: Scheme[] }>('/api/membership/schemes/all', { key: 'membership:schemes' })

const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const

// A draft is made from its name alone; everything else is asked on the page that opens.
const open = ref(false)
const form = reactive({ name: '', idempotency: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openAdd() {
  Object.assign(form, { name: '', idempotency: crypto.randomUUID() })
  refusal.value = null
  open.value = true
}
async function create() {
  refusal.value = null
  try {
    const made = await $api<{ schemeId: string }>('/api/membership/schemes', { method: 'POST', headers: { 'idempotency-key': form.idempotency }, body: { name: form.name } })
    open.value = false
    await navigateTo(`/admin/modules/membership/schemes/${made.schemeId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
// Draft and archived are the catalogue's shared words; open and closed are a scheme's own.
const schemeStateLabel = (state: string) => state === 'draft' || state === 'archived' ? t(`core.states.${state}`) : t(`membership.screens.states.${state}`)
</script>

<template>
  <PageFrame
    :title="t('membership.navigation.schemes.label')"
    :description="t('membership.screens.schemes.help')"
  >
    <template #primary>
      <UButton
        :label="t('membership.screens.schemes.add')"
        icon="i-lucide-plus"
        @click="openAdd"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.schemes.length"
        icon="i-lucide-id-card"
        :title="t('membership.screens.schemes.empty')"
        :description="t('membership.screens.schemes.empty-help')"
      />
      <RecordList
        v-else
        :label="t('membership.navigation.schemes.label')"
      >
        <RecordListItem
          v-for="s in data.schemes"
          :key="s.id"
          :to="`/admin/modules/membership/schemes/${s.id}`"
          :name="s.name"
          :description="`${t(`membership.screens.sides.${s.side}`)} · ${t('membership.screens.schemes.holders', { count: s.holders })}`"
          :muted="s.state === 'archived'"
        >
          <StatusBadge
            :tone="TONE[s.state]"
            :label="schemeStateLabel(s.state)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>
    <PageSection
      class="mt-6"
      :title="t('membership.screens.schemes.member-fields')"
      :description="t('membership.screens.schemes.member-fields-help')"
    >
      <FormsSlotForms
        slot-id="membership.member-fields"
        subject="*"
      />
    </PageSection>

    <UModal
      v-model:open="open"
      :title="t('membership.screens.schemes.add')"
      :description="t('membership.screens.schemes.add-help')"
    >
      <template #body>
        <UForm
          id="membership-new-scheme"
          :state="form"
          :validate="() => needs({ name: form.name })"
          class="space-y-4"
          novalidate
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('membership.screens.scheme.name')"
            :help="t('membership.screens.scheme.name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-new-scheme"
          loading-auto
          :label="t('membership.screens.schemes.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
