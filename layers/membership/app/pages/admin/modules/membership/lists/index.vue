<!-- Verification lists (MEM-20, MEM-57): lists a scheme checks against, such as a students' union's
     list of student IDs. Shows each list's name, kind and size, never its contents. -->
<script setup lang="ts">
interface List { id: string, name: string, keyKind: 'email' | 'reference', entryCount: number, validUntil: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<{ lists: List[], keySet: boolean }>('/api/membership/lists', { key: 'membership:lists' })

const open = ref(false)
const form = reactive({ name: '', keyKind: 'reference' as List['keyKind'], referenceLabel: '', shapeKind: 'digits' as 'digits' | 'letters-and-digits', min: 8, max: 8, idempotency: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openAdd() {
  Object.assign(form, { name: '', keyKind: 'reference', referenceLabel: '', shapeKind: 'digits', min: 8, max: 8, idempotency: crypto.randomUUID() })
  refusal.value = null
  open.value = true
}
async function create() {
  refusal.value = null
  const reference = form.keyKind === 'reference'
  try {
    const made = await $api<{ listId: string }>('/api/membership/lists', {
      method: 'POST',
      headers: { 'idempotency-key': form.idempotency },
      body: { name: form.name, keyKind: form.keyKind, referenceLabel: reference ? form.referenceLabel : null, referenceShape: reference ? { kind: form.shapeKind, min: form.min, max: Math.max(form.min, form.max) } : null },
    })
    open.value = false
    await navigateTo(`/admin/modules/membership/lists/${made.listId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const describe = (l: List) => [
  t(`membership.screens.lists.kinds.${l.keyKind}`),
  t('membership.screens.lists.entries', { count: l.entryCount }),
  ...(l.validUntil ? [t('membership.screens.lists.valid-until', { date: day(l.validUntil) })] : []),
].join(' · ')
</script>

<template>
  <PageFrame
    :title="t('membership.navigation.lists.label')"
    :description="t('membership.screens.lists.help')"
  >
    <template #primary>
      <UButton
        :label="t('membership.screens.lists.add')"
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
      <UAlert
        v-if="data && !data.keySet"
        class="mb-6"
        color="warning"
        variant="subtle"
        icon="i-lucide-key-round"
        :title="t('membership.screens.lists.no-key')"
        :description="t('membership.screens.lists.no-key-help')"
      />
      <EmptyState
        v-if="!data?.lists.length"
        icon="i-lucide-list-checks"
        :title="t('membership.screens.lists.empty')"
        :description="t('membership.screens.lists.empty-help')"
      />
      <RecordList
        v-else
        :label="t('membership.navigation.lists.label')"
      >
        <RecordListItem
          v-for="l in data.lists"
          :key="l.id"
          :to="`/admin/modules/membership/lists/${l.id}`"
          :name="l.name"
          :description="describe(l)"
        />
      </RecordList>
      <KeysCard
        class="mt-6"
        :names="['MEMBERSHIP_LIST_KEY']"
        :generate="['MEMBERSHIP_LIST_KEY']"
        @saved="refresh()"
      />
    </DataBoundary>

    <UModal
      v-model:open="open"
      :title="t('membership.screens.lists.add')"
    >
      <template #body>
        <UForm
          id="membership-new-list"
          :state="form"
          :validate="() => listErrors({ name: form.name, referenceLabel: form.keyKind === 'reference' ? form.referenceLabel : undefined })"
          class="space-y-4"
          novalidate
          @submit="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('membership.screens.list.name')"
            :help="t('membership.screens.list.name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            :label="t('membership.screens.list.kind')"
            required
          >
            <URadioGroup
              v-model="form.keyKind"
              :items="(['reference', 'email'] as const).map(v => ({ value: v, label: t(`membership.screens.lists.kinds.${v}`), description: t(`membership.screens.lists.kinds.${v}-help`) }))"
            />
          </UFormField>
          <MembershipListShape
            v-if="form.keyKind === 'reference'"
            v-model:label="form.referenceLabel"
            v-model:kind="form.shapeKind"
            v-model:min="form.min"
            v-model:max="form.max"
            :label-error="refusal?.fields?.referenceLabel ? refusal.reason : undefined"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-new-list"
          loading-auto
          :label="t('membership.screens.lists.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
