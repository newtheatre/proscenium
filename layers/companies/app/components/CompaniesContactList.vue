<!-- A company's Contacts tab (CO-07): who acts for it, the primary first, with their role and what
     they are sent. Someone who manages contacts sees addresses and phones, and adds, changes and ends them. -->
<script setup lang="ts">
import type { CompanyDetail, ContactRow } from '../../shared/views'

const props = defineProps<{ company: CompanyDetail }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { offer } = useUndo()
const editing = ref<ContactRow | null>(null)
const ending = ref<ContactRow | null>(null)
const dialog = ref(false)
const endDialog = ref(false)
const manage = computed(() => props.company.canManageContacts && !props.company.archived)

function edit(c: ContactRow | null) {
  editing.value = c
  dialog.value = true
}
function end(c: ContactRow) {
  ending.value = c
  endDialog.value = true
}
function done(message: string) {
  emit('changed')
  offer(message)
}
const describe = (c: ContactRow) => [
  c.role,
  c.email,
  c.dayPhone,
  c.receives.length ? t('companies.contacts.sent', { what: c.receives.map(r => t(`companies.receives.${r}`)).join(', ') }) : t('companies.contacts.sent-nothing'),
].filter(Boolean).join(' · ')
const actions = (c: ContactRow) => manage.value
  ? [
      [{ label: t('companies.contacts.change-short'), icon: 'i-lucide-pencil', onSelect: () => edit(c) }],
      [{ label: t('companies.contacts.end-button'), icon: 'i-lucide-user-minus', color: 'error' as const, onSelect: () => end(c) }],
    ]
  : []
</script>

<template>
  <PageSection
    :title="t('companies.tabs.contacts')"
    :description="t('companies.contacts.description')"
  >
    <template
      v-if="manage"
      #actions
    >
      <UButton
        :label="t('companies.contacts.add')"
        icon="i-lucide-user-plus"
        color="neutral"
        variant="outline"
        @click="edit(null)"
      />
    </template>
    <EmptyState
      v-if="!company.contacts.length"
      :title="t('companies.contacts.empty')"
      :description="t('companies.contacts.empty-description')"
      icon="i-lucide-users"
    />
    <RecordList
      v-else
      :label="t('companies.tabs.contacts')"
    >
      <RecordListItem
        v-for="c in company.contacts"
        :key="c.id"
        :name="c.name"
        :description="describe(c)"
      >
        <UBadge
          v-if="c.isPrimary"
          :label="t('companies.contacts.primary')"
          color="neutral"
          variant="subtle"
        />
        <UBadge
          v-if="c.unclaimed"
          :label="t('companies.contacts.unclaimed')"
          color="neutral"
          variant="outline"
        />
        <RowActions
          :items="actions(c)"
          :label="t('companies.contacts.actions', { name: c.name })"
        />
      </RecordListItem>
    </RecordList>
    <CompaniesContactDialog
      v-model:open="dialog"
      :company-id="company.id"
      :contact="editing"
      :has-primary="company.contacts.some(c => c.isPrimary)"
      @saved="done"
    />
    <CompaniesEndContactDialog
      v-model:open="endDialog"
      :company-id="company.id"
      :contact="ending"
      :others="company.contacts.filter(c => c.id !== ending?.id)"
      @ended="done"
    />
  </PageSection>
</template>
