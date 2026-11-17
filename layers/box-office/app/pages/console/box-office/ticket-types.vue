<!-- Ticket types (Box office specification, part 6): the kinds of ticket the theatre sells, such as
     Full price and Concession, shared by every production. A production gives each one a price in
     each of its bands on a performance's set-up. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type Kind = 'standard' | 'concession' | 'companion' | 'complimentary'
interface TicketType { id: string, name: string, kind: Kind, proofNote: string | null, needsPaidTicket: boolean, active: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ ticketTypes: TicketType[] }>('/api/box-office/ticket-types', { key: 'box-office:ticket-types' })

const kinds = computed(() => (['standard', 'concession', 'companion', 'complimentary'] as const).map(value => ({ value, label: t(`box-office.ticket-types.kind.${value}`) })))
const form = ref({ name: '', kind: 'standard' as Kind, proofNote: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function add() {
  refusal.value = null
  try {
    await $api('/api/box-office/ticket-types', { method: 'POST', body: { name: form.value.name.trim(), kind: form.value.kind, proofNote: form.value.proofNote.trim() || null } })
    toast.add({ title: t('box-office.ticket-types.added', { name: form.value.name.trim() }), color: 'success' })
    form.value = { name: '', kind: 'standard', proofNote: '' }
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.ticket-types.label')"
    :description="t('box-office.ticket-types.description')"
  >
    <div class="space-y-8">
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <EmptyState
            v-if="!d.ticketTypes.length"
            :title="t('box-office.ticket-types.empty.title')"
            :description="t('box-office.ticket-types.empty.description')"
            icon="i-lucide-tags"
          />
          <RecordList
            v-else
            :label="t('box-office.navigation.ticket-types.label')"
          >
            <RecordListItem
              v-for="type in d.ticketTypes"
              :key="type.id"
              :name="type.name"
              :description="[t(`box-office.ticket-types.kind.${type.kind}`), type.proofNote].filter(Boolean).join(' · ')"
              :muted="!type.active"
            />
          </RecordList>
        </template>
      </DataBoundary>

      <PageSection :title="t('box-office.ticket-types.add.title')">
        <UForm
          class="space-y-4"
          :state="form"
          @submit="add"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('box-office.ticket-types.add.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="60"
            />
          </UFormField>
          <UFormField :label="t('box-office.ticket-types.add.kind')">
            <USelect
              v-model="form.kind"
              :items="kinds"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.ticket-types.add.proof')"
            :help="t('box-office.ticket-types.add.proof-help')"
          >
            <UInput
              v-model="form.proofNote"
              maxlength="120"
            />
          </UFormField>
          <UButton
            type="submit"
            :label="t('box-office.ticket-types.add.button')"
            :disabled="!form.name.trim()"
          />
        </UForm>
      </PageSection>
    </div>
  </PageFrame>
</template>
