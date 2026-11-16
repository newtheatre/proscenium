<!-- Email addresses (ID-12; identity spec part 6). Each address, whether it is confirmed, and which
     one the theatre writes to (and, for a member, which one members' notices go to). Adding one sends
     a link; removing one needs a recent re-assertion, confirmed in place by `$api`. The server keeps
     the rules: never the address written to, never the last confirmed one. -->
<script setup lang="ts">
import { z } from 'zod'
import type { RefusalView } from '../../utils/refusal'

interface Address { id: string, address: string, verified: boolean, audience: boolean, members: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { has } = useViewer()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ addresses: Address[] }>('/api/core/me/addresses', { key: 'core:my-addresses' })

const refusal = ref<RefusalView | null>(null)
const member = computed(() => has('members'))

async function use(address: Address, side: 'audience' | 'members') {
  refusal.value = null
  try {
    await $api(`/api/core/me/addresses/${address.id}` as '/api/core/me/addresses/:id', { method: 'PUT', body: { use: side } })
    toast.add({ title: t('core.me.email.now-used', { address: address.address }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function remove(address: Address) {
  if (!await confirm({ verb: t('core.me.email.remove-verb'), thing: address.address, consequence: t('core.me.email.remove-consequence') })) return
  refusal.value = null
  try {
    await $api(`/api/core/me/addresses/${address.id}` as '/api/core/me/addresses/:id', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.me.email.removed', { address: address.address }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const schema = z.object({ address: z.email().max(254) })
const adding = reactive({ address: '' })
const sending = ref(false)
const addRefusal = ref<RefusalView | null>(null)

async function add() {
  sending.value = true
  addRefusal.value = null
  const address = adding.address.trim()
  try {
    await $api('/api/core/me/addresses', { method: 'POST', body: { address } })
    toast.add({ title: t('core.me.email.sent', { address }), color: 'success' })
    adding.address = ''
    await refresh()
  }
  catch (e) {
    addRefusal.value = toRefusal(e)
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.email.title')"
    :description="t('core.me.email.intro')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <div class="space-y-6">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <RecordList
          v-if="data"
          :label="t('core.me.email.title')"
        >
          <RecordListItem
            v-for="a in data.addresses"
            :key="a.id"
            icon="i-lucide-mail"
            :name="a.address"
          >
            <template #description>
              <span class="flex flex-wrap gap-2 pt-1">
                <StatusBadge
                  :tone="a.verified ? 'success' : 'warning'"
                  :label="a.verified ? t('core.me.email.confirmed') : t('core.me.email.waiting')"
                />
                <UBadge
                  v-if="a.audience"
                  color="neutral"
                  variant="subtle"
                  :label="t('core.me.email.audience')"
                />
                <UBadge
                  v-if="member && a.members"
                  color="neutral"
                  variant="subtle"
                  :label="t('core.me.email.members')"
                />
              </span>
            </template>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                v-if="a.verified && !a.audience"
                size="sm"
                color="neutral"
                variant="outline"
                :label="t('core.me.email.use-audience')"
                @click="use(a, 'audience')"
              />
              <UButton
                v-if="member && a.verified && !a.members"
                size="sm"
                color="neutral"
                variant="outline"
                :label="t('core.me.email.use-members')"
                @click="use(a, 'members')"
              />
              <UButton
                v-if="!a.audience && !(member && a.members)"
                size="sm"
                color="error"
                variant="ghost"
                :label="t('core.me.email.remove')"
                :aria-label="`${t('core.me.email.remove')} ${a.address}`"
                @click="remove(a)"
              />
            </div>
          </RecordListItem>
        </RecordList>
      </DataBoundary>

      <PageSection
        :title="t('core.me.email.add')"
        :description="t('core.me.email.add-help')"
      >
        <UForm
          :schema="schema"
          :state="adding"
          class="space-y-4"
          @submit="add"
        >
          <RefusalNotice :refusal="addRefusal" />
          <UFormField
            name="address"
            :label="t('core.me.email.address')"
          >
            <UInput
              v-model="adding.address"
              type="email"
              autocomplete="email"
              maxlength="254"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            :loading="sending"
            icon="i-lucide-send"
            :label="t('core.me.email.send-link')"
          />
        </UForm>
      </PageSection>
    </div>
  </PageFrame>
</template>
