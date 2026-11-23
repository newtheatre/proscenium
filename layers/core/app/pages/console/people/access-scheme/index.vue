<!-- The access scheme's queue (ID-40, ID-42; identity spec part 6): applications waiting for a
     decision, oldest first, with how long each has waited. Names and states only; needs show once
     one is opened, and opening one is recorded. The two ways to bring somebody in start here: email
     them a link to apply, or fill the form in with them now. -->
<script setup lang="ts">
import { accessPersonInput } from '../../../../../shared/access-scheme'

interface Row { accountId: string, name: string | null, change: boolean, submittedVia: 'self' | 'staff', waitingFor: number, overdue: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const DAY = 86_400_000 // not-policy: milliseconds in a day

const columns = [
  { key: 'name', label: t('core.access.queue.person'), card: true },
  { key: 'change', label: t('core.access.queue.kind'), card: true },
  { key: 'waitingFor', label: t('core.access.queue.waited'), card: true },
]
const { toRefusal, fieldErrors } = useRefusal()
const personForm = useTemplateRef('personForm')
const toast = useToast()
// One dialogue for both ways in: 'invite' emails a link, 'apply' opens the form to fill in with them.
const mode = ref<'invite' | 'apply' | null>(null)
const open = computed({ get: () => mode.value !== null, set: (v: boolean) => { if (!v) mode.value = null } })
const person = reactive({ name: '', address: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function start(m: 'invite' | 'apply') {
  refusal.value = null
  mode.value = m
}

async function go() {
  refusal.value = null
  const body = { name: person.name, address: person.address }
  try {
    if (mode.value === 'invite') {
      await $api('/api/core/access-scheme/invitations', { method: 'POST', body })
      toast.add({ title: t('core.access.invite.sent', { address: person.address }), color: 'success' })
      mode.value = null
    }
    else {
      const found = await $api<{ accountId: string, applied: boolean }>('/api/core/access-scheme/people', { method: 'POST', body })
      const page = `/console/people/access-scheme/${encodeURIComponent(found.accountId)}`
      // Somebody who has applied already is shown their application, not a blank form.
      if (found.applied) toast.add({ title: t('core.access.apply-for.already', { name: person.name }), color: 'info' })
      mode.value = null
      await navigateTo(found.applied ? page : `${page}/apply`)
    }
    person.name = ''
    person.address = ''
  }
  catch (error) {
    refusal.value = toRefusal(error)
    personForm.value?.setErrors(fieldErrors(refusal.value))
  }
}

const filters = [{
  name: 'kind',
  label: t('core.access.queue.kind'),
  primary: true,
  options: [{ value: 'new', label: t('core.access.queue.new') }, { value: 'change', label: t('core.access.queue.change') }],
}]
</script>

<template>
  <div>
    <PageList
      :title="t('core.navigation.access-scheme-queue.label')"
      route="/api/core/access-scheme"
      row-key="accountId"
      :columns="columns"
      :filters="filters"
      :row-label="(row: Row) => row.name ?? t('core.access.queue.unnamed')"
      :row-to="(row: Row) => `/console/people/access-scheme/${encodeURIComponent(row.accountId)}`"
      :empty="{ title: t('core.access.queue.empty'), description: t('core.access.queue.empty-description'), icon: 'i-lucide-accessibility' }"
    >
      <template #primary>
        <UButton
          icon="i-lucide-file-pen-line"
          :label="t('core.access.apply-for.button')"
          @click="start('apply')"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-send"
          :label="t('core.access.invite.button')"
          @click="start('invite')"
        />
      </template>
      <template #cell-name="{ row }">
        {{ row.name ?? t('core.access.queue.unnamed') }}
      </template>
      <template #cell-change="{ row }">
        {{ row.change ? t('core.access.queue.change') : t('core.access.queue.new') }}<span
          v-if="row.submittedVia === 'staff'"
          class="text-muted"
        > · {{ t('core.access.queue.by-staff') }}</span>
      </template>
      <template #cell-waitingFor="{ row }">
        <span class="inline-flex items-center gap-2">
          {{ row.waitingFor < DAY ? t('core.access.queue.today') : t('core.access.queue.days', { count: Math.floor(row.waitingFor / DAY) }) }}
          <StatusBadge
            v-if="row.overdue"
            tone="warning"
            :label="t('core.access.queue.overdue')"
          />
        </span>
      </template>
    </PageList>

    <UModal
      v-model:open="open"
      :title="mode === 'apply' ? t('core.access.apply-for.button') : t('core.access.invite.button')"
      :description="mode === 'apply' ? t('core.access.apply-for.description') : t('core.access.invite.description')"
    >
      <template #body>
        <UForm
          id="access-person"
          ref="personForm"
          :schema="accessPersonInput"
          class="space-y-4"
          :state="person"
          novalidate
          @submit="go"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('core.access.invite.name')"
            required
          >
            <UInput
              v-model="person.name"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            name="address"
            :label="t('core.access.invite.address')"
            required
          >
            <UInput
              v-model="person.address"
              type="email"
              maxlength="254"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="access-person"
          :loading="personForm?.loading"
          :label="mode === 'apply' ? t('core.access.apply-for.continue') : t('core.access.invite.send')"
        />
      </template>
    </UModal>
  </div>
</template>
