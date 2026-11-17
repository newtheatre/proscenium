<!-- Applications waiting to be checked (tab 5, "Applications"; V2, V3): each with who applied, for
     which scheme and why it waits, and Pass and Decline. The server refuses a person checking
     their own, or without membership.membership.verify. -->
<script setup lang="ts">
interface Application { id: string, accountId: string, accountName: string | null, schemeId: string, schemeName: string, appliedAt: number, reason: string | null, listName: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ applications: Application[] }>('/api/membership/applications', { key: 'membership:applications' })

const deciding = ref<{ application: Application, outcome: 'pass' | 'decline' } | null>(null)
const note = ref('')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function open(application: Application, outcome: 'pass' | 'decline') {
  deciding.value = { application, outcome }
  note.value = ''
  refusal.value = null
}
async function decide() {
  const { application, outcome } = deciding.value!
  refusal.value = null
  try {
    await $api(`/api/membership/applications/${application.id}/decide` as string, { method: 'POST', body: { outcome, note: note.value.trim() || null } })
    toast.add({ title: t(`membership.screens.applications.done-${outcome}`, { name: application.accountName ?? '' }), color: 'success' })
    deciding.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const describe = (a: Application) => [
  a.schemeName,
  t('membership.screens.applications.applied', { date: day(new Date(a.appliedAt).toISOString().slice(0, 10)) }), // not-policy: the length of a date
  t(`membership.screens.applications.reasons.${a.reason ?? 'staff-check'}`),
  ...(a.listName ? [t('membership.screens.applications.list-name', { name: a.listName })] : []),
].join(' · ')
</script>

<template>
  <PageFrame
    :title="t('membership.navigation.applications.label')"
    :description="t('membership.screens.applications.help')"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.applications.length"
        icon="i-lucide-inbox"
        :title="t('membership.screens.applications.empty')"
        :description="t('membership.screens.applications.empty-help')"
      />
      <RecordList
        v-else
        :label="t('membership.navigation.applications.label')"
      >
        <RecordListItem
          v-for="a in data.applications"
          :key="a.id"
          :name="a.accountName ?? t('membership.screens.applications.no-name')"
          :description="describe(a)"
        >
          <div class="flex gap-2">
            <UButton
              size="sm"
              :label="t('membership.screens.applications.pass')"
              @click="open(a, 'pass')"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :label="t('membership.screens.applications.decline')"
              @click="open(a, 'decline')"
            />
          </div>
        </RecordListItem>
      </RecordList>
    </DataBoundary>

    <UModal
      :open="!!deciding"
      :title="deciding ? t(`membership.screens.applications.title-${deciding.outcome}`, { name: deciding.application.accountName ?? '', scheme: deciding.application.schemeName }) : ''"
      @update:open="v => { if (!v) deciding = null }"
    >
      <template #body>
        <UForm
          id="membership-decide"
          :state="{ note }"
          class="space-y-4"
          novalidate
          @submit="decide"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ deciding ? t(`membership.screens.applications.consequence-${deciding.outcome}`) : '' }}
          </p>
          <UFormField
            :label="t('membership.screens.applications.note')"
            :help="t('membership.screens.applications.note-help')"
          >
            <UTextarea
              v-model="note"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-decide"
          loading-auto
          :color="deciding?.outcome === 'decline' ? 'error' : 'primary'"
          :label="deciding ? t(`membership.screens.applications.${deciding.outcome}`) : ''"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
