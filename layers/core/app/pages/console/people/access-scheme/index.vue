<!-- The access scheme's queue (ID-40; identity spec part 6): open applications and changes, oldest
     first, with how long each has waited. Names and states only; needs show once one is opened, and
     opening one is recorded. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Row { accountId: string, name: string | null, change: boolean, submittedVia: 'self' | 'staff', waitingFor: number, overdue: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const DAY = 86_400_000 // not-policy: milliseconds in a day

const columns = [
  { key: 'name', label: t('core.access.queue.person'), card: true },
  { key: 'change', label: t('core.access.queue.kind'), card: true },
  { key: 'waitingFor', label: t('core.access.queue.waited'), card: true },
]
const { toRefusal } = useRefusal()
const toast = useToast()
const inviting = ref(false)
const busy = ref(false)
const invite = reactive({ name: '', address: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function sendInvitation() {
  busy.value = true
  refusal.value = null
  try {
    await $api('/api/core/access-scheme/invitations', { method: 'POST', body: { name: invite.name, address: invite.address } })
    toast.add({ title: t('core.access.invite.sent', { address: invite.address }), color: 'success' })
    inviting.value = false
    invite.name = ''
    invite.address = ''
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  finally {
    busy.value = false
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
          icon="i-lucide-send"
          :label="t('core.access.invite.button')"
          @click="inviting = true"
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
          {{ t('core.access.queue.days', { count: Math.floor(row.waitingFor / DAY) }) }}
          <StatusBadge
            v-if="row.overdue"
            tone="warning"
            :label="t('core.access.queue.overdue')"
          />
        </span>
      </template>
    </PageList>

    <UModal
      v-model:open="inviting"
      :title="t('core.access.invite.button')"
      :description="t('core.access.invite.description')"
    >
      <template #body>
        <form
          id="invite-to-apply"
          class="space-y-4"
          @submit.prevent="sendInvitation"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('core.access.invite.name')"
            required
          >
            <UInput
              v-model="invite.name"
              maxlength="200"
              class="w-full"
            />
          </UFormField>
          <UFormField
            :label="t('core.access.invite.address')"
            required
            :error="refusal?.fields?.address ? refusal.reason : undefined"
          >
            <UInput
              v-model="invite.address"
              type="email"
              maxlength="254"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="invite-to-apply"
          :loading="busy"
          :label="t('core.access.invite.send')"
          :disabled="!invite.name.trim() || !invite.address.trim()"
        />
      </template>
    </UModal>
  </div>
</template>
