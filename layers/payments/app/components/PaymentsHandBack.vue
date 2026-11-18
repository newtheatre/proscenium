<!-- Refunds to hand back (box office review, O3): approved refunds that a person gives back, cash or
     a payment taken on a card machine not connected to the site, listed where sellers work (the till
     and Your session) with the amount, the sale it came from and a "Handed back" button. Cash comes
     out of the seller's session, so handing it back at the till opens one at this device's place
     when none is open. Shows nothing when nothing is waiting. -->
<script setup lang="ts">
interface ToHandBack { id: string, amountMinor: number, currency: string, method: string, owner: { module: string, record: string, reference?: string, buyer?: string | null, to?: string }, approvedByName: string | null, createdAt: number }

const props = withDefaults(defineProps<{ live?: boolean }>(), { live: false })
const emit = defineEmits<{ changed: [] }>()

const { t, te } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime: when } = useDates()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, refresh } = await useAPI<{ refunds: ToHandBack[] }>('/api/payments/refunds/hand-back', { key: 'payments:hand-back', default: () => ({ refunds: [] }) })

const busy = ref<string | null>(null)
const ownerName = (r: ToHandBack) => r.owner.reference ?? (te(`${r.owner.module}.module.name`) ? t(`${r.owner.module}.module.name`) : r.owner.module)
const thing = (r: ToHandBack) => t('payments.screens.refunds.thing', { amount: money(r.amountMinor, r.currency), method: t(`payments.screens.methods.${r.method}`) })

// The place this device sells at, where a session opened for a cash hand-back goes.
function deviceSpace(): string | null {
  try { return localStorage.getItem('payments.till.space') || null }
  catch { return null }
}

async function handBack(r: ToHandBack) {
  const ok = await confirm({
    verb: t('payments.screens.refunds.confirm-verb'),
    thing: thing(r),
    consequence: t('payments.screens.refunds.confirm-consequence'),
    button: t('payments.screens.refunds.confirm-button'),
  })
  if (!ok) return
  busy.value = r.id
  try {
    if (r.method === 'cash') {
      try {
        await $api('/api/payments/till/session', { method: 'POST', body: { spaceId: deviceSpace() } })
      }
      catch { /* a session is already open, or none may be: the hand-back says which */ }
    }
    await $api(`/api/payments/refunds/${r.id}/confirm` as string, { method: 'POST', body: {} })
    toast.add({ title: t('payments.screens.refunds.confirm-done'), color: 'success' })
    await Promise.all([refresh(), refreshNuxtData('payments:session')])
    emit('changed')
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <UAlert
    v-if="data.refunds.length"
    color="warning"
    variant="subtle"
    icon="i-lucide-hand-coins"
    :title="t('payments.screens.hand-back.title', { count: data.refunds.length })"
    :ui="{ description: 'space-y-3' }"
  >
    <template #description>
      <p>{{ t('payments.screens.hand-back.help') }}</p>
      <RecordList :label="t('payments.screens.hand-back.title', { count: data.refunds.length })">
        <RecordListItem
          v-for="r in data.refunds"
          :key="r.id"
          :name="t('payments.screens.hand-back.line', { amount: money(r.amountMinor, r.currency), method: t(`payments.screens.methods.${r.method}`) })"
        >
          <template #description>
            <ULink
              v-if="r.owner.to"
              :to="r.owner.to"
            >
              {{ ownerName(r) }}
            </ULink>
            <span v-else>{{ ownerName(r) }}</span>
            <span v-if="r.owner.buyer"> · {{ r.owner.buyer }}</span>
            <span> · {{ t('payments.screens.hand-back.asked', { when: when(r.createdAt) }) }}</span>
          </template>
          <UButton
            :loading="busy === r.id"
            :disabled="!!busy && busy !== r.id"
            :size="props.live ? 'xl' : 'md'"
            icon="i-lucide-hand-coins"
            :label="t('payments.screens.refunds.confirm-button')"
            @click="handBack(r)"
          />
        </RecordListItem>
      </RecordList>
    </template>
  </UAlert>
</template>
