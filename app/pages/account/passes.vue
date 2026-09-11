<script setup lang="ts">
import { saysPrice } from '#shared/utils/ticket-types'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

interface SellablePassType {
  id: string
  name: string
  description: string | null
}

interface HeldPass {
  id: string
  reference: string
  passTypeName: string
  priceLabel: string
  pricePaid: number
  status: string
}

interface OwnRequest {
  id: string
  passTypeName: string
  status: string
}

interface Listing {
  passes: HeldPass[]
  requests: OwnRequest[]
  sellable: SellablePassType[]
}

const toast = useToast()

const { data, refresh } = await useAsyncData<Listing>(
  'account-passes',
  () => $fetch<Listing>('/api/account/passes'),
  { default: (): Listing => ({ passes: [], requests: [], sellable: [] }) },
)

const requesting = ref<string | null>(null)
const requestFailure = ref<string | null>(null)

async function request(passTypeId: string): Promise<void> {
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
    class="max-w-3xl py-10"
    data-test="account-passes-page"
  >
    <UPageHeader
      title="Passes"
      description="Passes you hold, and any request still with an officer."
    />

    <div class="mt-6 space-y-6">
      <UCard>
        <template #header>
          <h2 class="nnt-headline text-lg">
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
              {{ pass.status }}
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
          <h2 class="nnt-headline text-lg">
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
              {{ req.status }}
            </UBadge>
          </li>
        </ul>
      </UCard>

      <UCard v-if="data.sellable.length > 0">
        <template #header>
          <h2 class="nnt-headline text-lg">
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

        <ul class="space-y-2 text-sm">
          <li
            v-for="type in data.sellable"
            :key="type.id"
            class="flex items-center justify-between"
          >
            <span>{{ type.name }}</span>
            <UButton
              size="sm"
              variant="subtle"
              :loading="requesting === type.id"
              :data-test="`account-pass-request-${type.id}`"
              @click="request(type.id)"
            >
              Request
            </UButton>
          </li>
        </ul>
      </UCard>
    </div>
  </UContainer>
</template>
