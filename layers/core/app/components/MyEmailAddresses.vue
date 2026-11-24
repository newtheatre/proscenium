<!-- Email addresses (ID-12; identity spec part 6), a section of My account's Details. Each address,
     whether it is confirmed, and which one the theatre writes to (and, for a member, which one
     members' notices go to). Adding one sends a link; removing one needs a recent re-assertion,
     confirmed in place by `$api`. The server keeps the rules: never the address written to, never
     the last confirmed one. -->
<script setup lang="ts">
import { z } from 'zod'
import type { RefusalView } from '../utils/refusal'

interface Address { id: string, address: string, verified: boolean, audience: boolean, members: boolean, resendAt?: number }

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

// Sending a link again goes through the same route as adding; the server keeps a pause between sends.
const now = ref(new Date())
let ticking: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  ticking = setInterval(() => (now.value = new Date()), 1000) // not-policy: a once-a-second countdown
})
onBeforeUnmount(() => clearInterval(ticking))
const waitSeconds = (a: Address) => a.resendAt ? Math.max(0, Math.ceil((a.resendAt - now.value.getTime()) / 1000)) : 0 // not-policy: milliseconds to whole seconds

async function resend(address: Address) {
  refusal.value = null
  try {
    await $api('/api/core/me/addresses', { method: 'POST', body: { address: address.address } })
    toast.add({ title: t('core.me.email.sent', { address: address.address }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const schema = z.object({ address: z.email().max(254) })
const adding = reactive({ address: '' })
const addRefusal = ref<RefusalView | null>(null)

async function add() {
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
}
</script>

<template>
  <PageSection
    id="email"
    :title="t('core.me.email.title')"
    :description="t('core.me.email.intro')"
  >
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
              v-if="!a.verified"
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-send"
              loading-auto
              :disabled="waitSeconds(a) > 0"
              :label="waitSeconds(a) > 0 ? t('core.me.email.resend-in', { count: waitSeconds(a) }) : t('core.me.email.resend')"
              :aria-label="`${t('core.me.email.resend')} ${a.address}`"
              @click="resend(a)"
            />
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
    <UForm
      :schema="schema"
      :state="adding"
      class="space-y-4"
      novalidate
      @submit="add"
    >
      <RefusalNotice :refusal="addRefusal" />
      <UFormField
        name="address"
        :label="t('core.me.email.add')"
        :help="t('core.me.email.add-help')"
      >
        <UInput
          v-model="adding.address"
          type="email"
          autocomplete="email"
          maxlength="254"
        />
      </UFormField>
      <UButton
        type="submit"
        loading-auto
        icon="i-lucide-send"
        :label="t('core.me.email.send-link')"
      />
    </UForm>
  </PageSection>
</template>
