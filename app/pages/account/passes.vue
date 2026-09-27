<script setup lang="ts">
import { saysPrice } from '#shared/utils/ticket-types'
import { saysPassPrices, saysPassStatus, saysPayAtDesk } from '#shared/utils/passes'
import type { PassRequestStatus, PassStatus } from '#shared/utils/passes'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/my-nnt/passes' })

interface SellablePassType {
  id: string
  name: string
  description: string | null
  prices: { id: string, label: string, price: number }[]
  // Held already, or already asked for: either way Request is not offered (issue 1331).
  held: boolean
  openRequestId: string | null
}

interface HeldPass {
  id: string
  reference: string
  passTypeName: string
  priceLabel: string
  pricePaid: number
  status: PassStatus
  // Null for a pass the door would refuse as cancelled, expired or archived (issue 1332).
  qrSvg: string | null
}

interface OwnRequest {
  id: string
  passTypeName: string
  status: PassRequestStatus
}

interface Listing {
  passes: HeldPass[]
  requests: OwnRequest[]
  sellable: SellablePassType[]
}

const request = useRequestFetch()
const toast = useToast()

// A bare $fetch here carries no session cookie on a full page load, so a held pass or an open
// request read back as the empty default and never refetched (issue 1005, same class as issue 899).
const { data, refresh, error } = await useAsyncData<Listing>(
  'account-passes',
  () => request<Listing>('/api/account/passes'),
  { default: (): Listing => ({ passes: [], requests: [], sellable: [] }) },
)
const listFailure = useListFailure(error, 'Your passes could not be read.')

const requesting = ref<string | null>(null)
const requestFailure = ref<string | null>(null)

async function requestPass(passTypeId: string): Promise<void> {
  requesting.value = passTypeId
  requestFailure.value = null
  try {
    await $fetch('/api/account/passes/request', { method: 'POST', body: { passTypeId } })
    toast.add({ title: 'Pass requested', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    requestFailure.value = refusalText(error)
  }
  finally {
    requesting.value = null
  }
}

// Withdrawing removes the request, so it is asked about first (K-123, 0032); a refusal reads in
// the dialogue, not behind it.
const withdrawalAsked = ref<{ requestId: string, name: string } | null>(null)
const confirmingWithdrawal = computed({
  get: () => withdrawalAsked.value !== null,
  set: (open) => {
    if (!open) withdrawalAsked.value = null
  },
})
const withdrawing = ref(false)
const withdrawFailure = ref<string | null>(null)

function askWithdraw(type: SellablePassType): void {
  if (!type.openRequestId) return
  withdrawFailure.value = null
  withdrawalAsked.value = { requestId: type.openRequestId, name: type.name }
}

async function withdrawRequest(): Promise<void> {
  const asked = withdrawalAsked.value
  if (!asked) return
  withdrawing.value = true
  withdrawFailure.value = null
  try {
    await $fetch(`/api/account/passes/requests/${asked.requestId}`, { method: 'DELETE' })
    withdrawalAsked.value = null
    toast.add({ title: 'Request withdrawn', icon: 'i-lucide-check', color: 'neutral' })
    await refresh()
  }
  catch (error) {
    withdrawFailure.value = refusalText(error)
    await refresh()
  }
  finally {
    withdrawing.value = false
  }
}

const statusColor: Record<string, 'success' | 'neutral' | 'error' | 'warning'> = {
  ACTIVE: 'success',
  CANCELLED: 'error',
  EXPIRED: 'neutral',
  PENDING: 'warning',
  FULFILLED: 'success',
  DECLINED: 'error',
}
</script>

<template>
  <UContainer
    :class="MEMBER_PAGE_READING"
    data-test="account-passes-page"
  >
    <UPageHeader
      title="Passes"
      description="Passes you hold, and any you have asked for that are waiting to be paid for at the box office desk."
      :ui="MEMBER_PAGE_HEADER"
    />

    <ReadFailure
      v-if="listFailure"
      :failure="listFailure"
      class="mt-6"
      data-test="load-failed"
      @retry="refresh()"
    />

    <div class="mt-6 space-y-6">
      <UCard data-test="account-passes-held">
        <template #header>
          <h2 class="text-lg font-semibold">
            Your passes
          </h2>
        </template>

        <ul
          v-if="data.passes.length > 0"
          class="space-y-4 text-sm"
        >
          <li
            v-for="pass in data.passes"
            :key="pass.id"
            class="space-y-2"
          >
            <div class="flex items-center justify-between gap-3">
              <span>{{ pass.passTypeName }} ({{ pass.priceLabel }}, {{ saysPrice(pass.pricePaid) }}), reference {{ pass.reference }}</span>
              <UBadge :color="statusColor[pass.status] ?? 'neutral'">
                {{ saysPassStatus(pass.status) }}
              </UBadge>
            </div>
            <div
              v-if="pass.qrSvg"
              class="flex flex-wrap items-center gap-4"
            >
              <img
                :src="`data:image/svg+xml;base64,${pass.qrSvg}`"
                :alt="`QR code for pass ${pass.reference}`"
                width="160"
                height="160"
                :data-test="`account-pass-qr-${pass.id}`"
              >
              <p class="text-muted">
                Show at the door, on this screen or saved as an image.
              </p>
            </div>
          </li>
        </ul>
        <p
          v-else
          class="py-4 text-center text-sm text-muted"
        >
          You hold no passes. Ask for one below, pay for it at the box office desk, and it appears here.
        </p>
      </UCard>

      <UCard v-if="data.requests.length > 0">
        <template #header>
          <h2 class="text-lg font-semibold">
            Your requests
          </h2>
        </template>

        <ul class="space-y-2 text-sm">
          <li
            v-for="req in data.requests"
            :key="req.id"
            class="flex items-center justify-between"
          >
            <span>{{ req.passTypeName }}</span>
            <UBadge :color="statusColor[req.status] ?? 'neutral'">
              {{ saysPassStatus(req.status) }}
            </UBadge>
          </li>
        </ul>
      </UCard>

      <UCard
        v-if="data.sellable.length > 0"
        data-test="account-passes-sellable"
      >
        <template #header>
          <h2 class="text-lg font-semibold">
            Request a pass
          </h2>
        </template>

        <UAlert
          v-if="requestFailure"
          color="error"
          variant="subtle"
          :description="requestFailure"
          class="mb-4"
        />

        <ul class="space-y-4 text-sm">
          <li
            v-for="type in data.sellable"
            :key="type.id"
            class="flex flex-wrap items-start justify-between gap-3"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                {{ type.name }}
              </p>
              <p
                class="text-muted"
                :data-test="`account-pass-price-${type.id}`"
              >
                {{ saysPassPrices(type.prices) }}
              </p>
              <p
                v-if="type.description"
                class="mt-1 text-muted"
              >
                {{ type.description }}
              </p>
            </div>
            <p
              v-if="type.held"
              class="text-muted"
              :data-test="`account-pass-held-${type.id}`"
            >
              You hold this pass.
            </p>
            <div
              v-else-if="type.openRequestId"
              class="flex flex-wrap items-center gap-2"
              :data-test="`account-pass-requested-${type.id}`"
            >
              <span class="text-muted">Requested. {{ saysPayAtDesk(type.prices) }} to collect it.</span>
              <UButton
                size="sm"
                color="neutral"
                variant="subtle"
                :data-test="`account-pass-withdraw-${type.id}`"
                @click="askWithdraw(type)"
              >
                Withdraw
              </UButton>
            </div>
            <div
              v-else
              class="flex flex-wrap items-center gap-2"
            >
              <span class="text-muted">{{ saysPayAtDesk(type.prices) }}.</span>
              <UButton
                size="sm"
                variant="subtle"
                :loading="requesting === type.id"
                :data-test="`account-pass-request-${type.id}`"
                @click="requestPass(type.id)"
              >
                Request
              </UButton>
            </div>
          </li>
        </ul>
      </UCard>
    </div>

    <ConfirmModal
      v-model:open="confirmingWithdrawal"
      name="withdraw-pass-request"
      :title="`Withdraw your request for ${withdrawalAsked?.name ?? 'this pass'}`"
      verb="Withdraw the request"
      consequence="The box office desk no longer sees it. You can ask for the pass again afterwards."
      :loading="withdrawing"
      :failure="withdrawFailure"
      @confirm="withdrawRequest"
    />
  </UContainer>
</template>
