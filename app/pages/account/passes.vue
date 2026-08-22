<!--
The holder's own passes. A pass is an entitlement, not a reserved seat, so this
says what it covers and what has been used, never how many are "left".
-->
<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
  title: 'My passes',
})

interface Admission { performanceId: string, startsAt: string, showTitle: string }
interface Pass {
  id: string
  reference: string
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED'
  pricePaid: number
  issuedAt: string
  passTypeName: string
  passTypeDescription: string | null
  validFrom: string
  validTo: string
  inDate: boolean
  shows: Array<{ title: string, slug: string }>
  admissions: Admission[]
}

interface PassRequest {
  id: string
  status: 'PENDING' | 'FULFILLED' | 'DECLINED' | 'EXPIRED'
  quotedPence: number | null
  requestedAt: string
  passTypeName: string
}
interface OnSaleType {
  id: string
  name: string
  description: string | null
  validFrom: string
  validTo: string
  prices: Array<{ id: string, label: string, price: number }>
  shows: Array<{ title: string, slug: string }>
}

const requestFetch = useRequestFetch()
const toast = useToast()
const { data, refresh } = await useAsyncData('my-passes', () =>
  requestFetch<{ passes: Pass[], requests: PassRequest[] }>('/api/passes/mine'))

const { data: onSale } = await useAsyncData('pass-types-on-sale', () =>
  requestFetch<{ passTypes: OnSaleType[] }>('/api/pass-types/on-sale'))

const passes = computed(() => data.value?.passes ?? [])
const requests = computed(() => data.value?.requests ?? [])
const pending = computed(() => requests.value.filter(r => r.status === 'PENDING'))
const available = computed(() =>
  (onSale.value?.passTypes ?? []).filter(type =>
    !pending.value.some(r => r.passTypeName === type.name)))

const asking = ref<string | null>(null)

/** Asks; it does not buy. No pass exists until the box office is paid (ADR-0028). */
async function askFor(type: OnSaleType) {
  asking.value = type.id
  try {
    await requestFetch('/api/passes/mine/requests', {
      method: 'POST',
      body: { passTypeId: type.id, passTypePriceId: type.prices[0]?.id ?? null },
    })
    await refresh()
    toast.add({
      title: 'Asked for',
      description: 'The box office will have it ready. You pay in person.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  catch (error) {
    toast.add({
      title: 'Not sent',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    asking.value = null
  }
}
</script>

<template>
  <UContainer class="max-w-3xl space-y-6 py-8">
    <div>
      <h1 class="text-2xl font-semibold">
        My passes
      </h1>
      <p class="mt-1 text-sm text-muted">
        A pass covers admission to the shows below. It is an entitlement rather than a reserved
        seat, so it is still subject to capacity on the night.
      </p>
    </div>

    <UCard v-if="!passes.length && !pending.length">
      <p class="text-muted">
        You do not have a pass yet.
      </p>
    </UCard>

    <UCard
      v-for="request in pending"
      :key="request.id"
    >
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="font-semibold">
            {{ request.passTypeName }}
          </h2>
          <p class="text-sm text-muted">
            Asked for {{ formatDate(request.requestedAt) }}.
            <template v-if="request.quotedPence !== null">
              You were shown {{ formatMoney(request.quotedPence) }}.
            </template>
          </p>
        </div>
        <UBadge
          variant="subtle"
          color="warning"
        >
          Waiting to be paid for
        </UBadge>
      </div>
      <p class="mt-3 text-sm text-muted">
        Pay at the box office before a show and they will issue it. Nothing has been charged, and
        this does not admit you yet.
      </p>
    </UCard>

    <UCard
      v-for="pass in passes"
      :key="pass.id"
    >
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">
              {{ pass.passTypeName }}
            </h2>
            <p class="font-mono text-sm text-muted">
              {{ pass.reference }}
            </p>
          </div>
          <UBadge
            variant="subtle"
            :color="pass.inDate ? 'success' : pass.status === 'CANCELLED' ? 'error' : 'neutral'"
          >
            {{ pass.status === 'CANCELLED' ? 'Cancelled' : pass.inDate ? 'Valid' : 'Not valid today' }}
          </UBadge>
        </div>
      </template>

      <p
        v-if="pass.passTypeDescription"
        class="mb-3 text-sm"
      >
        {{ pass.passTypeDescription }}
      </p>
      <p class="text-sm text-muted">
        Valid {{ formatDate(pass.validFrom) }} to {{ formatDate(pass.validTo) }}
      </p>

      <div class="mt-4">
        <p class="text-xs uppercase tracking-wide text-muted">
          Covers
        </p>
        <ul
          v-if="pass.shows.length"
          class="mt-1 space-y-1 text-sm"
        >
          <li
            v-for="show in pass.shows"
            :key="show.slug"
          >
            <NuxtLink
              :to="`/whats-on/${show.slug}`"
              class="underline underline-offset-4"
            >
              {{ show.title }}
            </NuxtLink>
          </li>
        </ul>
        <p
          v-else
          class="mt-1 text-sm text-muted"
        >
          No shows have been added to this pass yet.
        </p>
      </div>

      <div class="mt-4">
        <p class="text-xs uppercase tracking-wide text-muted">
          Used for
        </p>
        <ul
          v-if="pass.admissions.length"
          class="mt-1 space-y-1 text-sm"
        >
          <li
            v-for="admission in pass.admissions"
            :key="admission.performanceId"
          >
            {{ admission.showTitle }} &middot; {{ formatDateTime(admission.startsAt) }}
          </li>
        </ul>
        <p
          v-else
          class="mt-1 text-sm text-muted"
        >
          Not used yet.
        </p>
      </div>
    </UCard>
    <UCard v-if="available.length">
      <template #header>
        <h2 class="font-semibold">
          Ask for a pass
        </h2>
      </template>
      <p class="mb-4 text-sm text-muted">
        We cannot take payment online. Asking here puts your name down; you pay at the box office in
        person and they issue it then.
      </p>
      <div class="space-y-4">
        <div
          v-for="type in available"
          :key="type.id"
          class="flex flex-wrap items-start justify-between gap-3 border-t pt-4 first:border-t-0 first:pt-0"
        >
          <div>
            <p class="font-medium">
              {{ type.name }}
              <span
                v-if="type.prices.length"
                class="text-muted"
              >
                &middot; {{ formatMoney(type.prices[0]!.price) }}
              </span>
            </p>
            <p
              v-if="type.description"
              class="text-sm text-muted"
            >
              {{ type.description }}
            </p>
            <p
              v-if="type.shows.length"
              class="mt-1 text-xs text-muted"
            >
              Covers {{ type.shows.map(s => s.title).join(', ') }}
            </p>
          </div>
          <UButton
            variant="subtle"
            :loading="asking === type.id"
            label="Ask for this"
            @click="askFor(type)"
          />
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
