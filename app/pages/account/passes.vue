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

const requestFetch = useRequestFetch()
const { data } = await useAsyncData('my-passes', () =>
  requestFetch<{ passes: Pass[] }>('/api/passes/mine'))

const passes = computed(() => data.value?.passes ?? [])
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

    <UCard v-if="!passes.length">
      <p class="text-muted">
        You do not have a pass. Passes are sold at the box office and in person before a show.
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
  </UContainer>
</template>
