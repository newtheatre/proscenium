<script setup lang="ts">
import { saysPrice } from '#shared/utils/ticket-types'
import { saysPassPrices, saysPassStatus } from '#shared/utils/passes'
import type { PassRequestStatus, PassStatus } from '#shared/utils/passes'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/members/passes' })

interface SellablePassType {
  id: string
  name: string
  description: string | null
  prices: { id: string, label: string, price: number }[]
}

interface HeldPass {
  id: string
  reference: string
  passTypeName: string
  priceLabel: string
  pricePaid: number
  status: PassStatus
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
      description="Passes you hold, and any request still with an officer."
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
          class="space-y-2 text-sm"
        >
          <li
            v-for="pass in data.passes"
            :key="pass.id"
            class="flex items-center justify-between"
          >
            <span>{{ pass.passTypeName }} ({{ pass.priceLabel }}, {{ saysPrice(pass.pricePaid) }}), reference {{ pass.reference }}</span>
            <UBadge :color="statusColor[pass.status] ?? 'neutral'">
              {{ saysPassStatus(pass.status) }}
            </UBadge>
          </li>
        </ul>
        <p
          v-else
          class="py-4 text-center text-sm text-muted"
        >
          You hold no passes yet.
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
            <UButton
              size="sm"
              variant="subtle"
              :loading="requesting === type.id"
              :data-test="`account-pass-request-${type.id}`"
              @click="requestPass(type.id)"
            >
              Request
            </UButton>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>
