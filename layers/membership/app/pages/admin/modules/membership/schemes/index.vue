<!-- Membership schemes (MEM-01, MEM-02): every scheme with its side, state and how many hold it now.
     A new scheme starts as a draft and opens on its own page once it is ready. -->
<script setup lang="ts">
interface Scheme { id: string, key: string, name: string, side: 'members' | 'audience', state: 'draft' | 'open' | 'closed' | 'archived', lengthRule: string, holders: number }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ schemes: Scheme[] }>('/api/membership/schemes/all', { key: 'membership:schemes' })

const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const

const open = ref(false)
const form = reactive({ name: '', key: '', side: 'members' as Scheme['side'], lengthRule: 'rolling' as 'fixed' | 'rolling' | 'indefinite', fixedEndMonth: 7, fixedEndDay: 31, idempotency: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
// The address follows the name until somebody types one.
const keyTouched = ref(false)
watch(() => form.name, (name) => {
  if (!keyTouched.value) form.key = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
})
function openAdd() {
  Object.assign(form, { name: '', key: '', side: 'members', lengthRule: 'rolling', fixedEndMonth: 7, fixedEndDay: 31, idempotency: crypto.randomUUID() })
  keyTouched.value = false
  refusal.value = null
  open.value = true
}
async function create() {
  refusal.value = null
  try {
    const fixed = form.lengthRule === 'fixed'
    const made = await $api<{ schemeId: string }>('/api/membership/schemes', {
      method: 'POST',
      headers: { 'idempotency-key': form.idempotency },
      body: { name: form.name, key: form.key, side: form.side, lengthRule: form.lengthRule, fixedEndMonth: fixed ? form.fixedEndMonth : null, fixedEndDay: fixed ? form.fixedEndDay : null },
    })
    open.value = false
    await navigateTo(`/admin/modules/membership/schemes/${made.schemeId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
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
            :label="t(`membership.screens.states.${s.state}`)"
          />
        </RecordListItem>
      </RecordList>
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('membership.screens.schemes.add')"
    >
      <template #body>
        <UForm
          id="membership-new-scheme"
          :state="form"
          class="space-y-4"
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('membership.screens.scheme.name')"
            :help="t('membership.screens.scheme.name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            :label="t('membership.screens.scheme.key')"
            :help="t('membership.screens.scheme.key-help')"
            required
            :error="refusal?.fields?.key || refusal?.code === 'membership.scheme.key-taken' ? refusal.reason : undefined"
          >
            <UInput
              v-model="form.key"
              maxlength="60"
              class="font-mono"
              @update:model-value="keyTouched = true"
            />
          </UFormField>
          <UFormField
            :label="t('membership.screens.scheme.side')"
            :help="t('membership.screens.scheme.side-help')"
            required
          >
            <URadioGroup
              v-model="form.side"
              :items="(['members', 'audience'] as const).map(v => ({ value: v, label: t(`membership.screens.sides.${v}`), description: t(`membership.screens.sides.${v}-help`) }))"
            />
          </UFormField>
          <MembershipLengthRule
            v-model:rule="form.lengthRule"
            v-model:month="form.fixedEndMonth"
            v-model:day="form.fixedEndDay"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-new-scheme"
          loading-auto
          :disabled="!form.name.trim() || !form.key.trim()"
          :label="t('membership.screens.schemes.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
