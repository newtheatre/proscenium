<script setup lang="ts">
import { describeExpiry, saysDeliveryMode, saysKind } from '#shared/utils/training'
import type { DeliveryMode, ExpiryMode, ModuleKind } from '#shared/utils/training'

interface Prerequisite { moduleId: string, name: string, held: boolean | null }

interface Module {
  id: string
  department: string
  departmentName: string
  kind: ModuleKind
  name: string
  description: string | null
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths: number | null
  safetyCritical: boolean
  materials: { label: string, url: string }[]
  prerequisites: Prerequisite[]
  held: boolean | null
}

interface Catalogue { items: Module[], signedIn: boolean }

const route = useRoute()

const { data } = await useFetch<Catalogue>('/api/training/catalogue', {
  default: (): Catalogue => ({ items: [], signedIn: false }),
})

const module = computed(() => data.value.items.find(one => one.id === route.params.id) ?? null)

// A module that is draft, retired or invented is the same answer to somebody reading a link.
if (!module.value) {
  throw createError({ statusCode: 404, statusMessage: 'No such module', fatal: true })
}

// What it unlocks is the interesting half, and it is the reverse of the edges we already have.
const unlocks = computed(() => data.value.items
  .filter(one => one.prerequisites.some(need => need.moduleId === module.value?.id)))

useSeoMeta({
  title: () => module.value ? `${module.value.name} (${module.value.id})` : 'Training',
  description: () => module.value?.description
    ?? `A ${module.value?.kind.toLowerCase()} taught at the Nottingham New Theatre.`,
})
</script>

<template>
  <UContainer
    v-if="module"
    class="max-w-3xl py-16"
    data-test="module-page"
  >
    <UButton
      to="/training/modules"
      variant="link"
      color="neutral"
      size="sm"
      icon="i-lucide-arrow-left"
      class="px-0"
    >
      What we teach
    </UButton>

    <div class="mt-4 space-y-3">
      <p class="font-mono text-sm text-muted">
        {{ module.id }} · {{ module.departmentName }}
      </p>
      <h1 class="nnt-headline text-4xl">
        {{ module.name }}
      </h1>
      <div class="flex flex-wrap gap-2">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          {{ saysKind(module.kind) }}
        </UBadge>
        <UBadge
          color="neutral"
          variant="subtle"
        >
          {{ saysDeliveryMode(module.deliveryMode) }}
        </UBadge>
        <UBadge
          v-if="module.safetyCritical"
          color="warning"
          variant="subtle"
          data-test="module-safety"
        >
          Safety critical
        </UBadge>
        <UBadge
          v-if="module.held"
          color="success"
          variant="subtle"
          data-test="module-held"
        >
          You hold this
        </UBadge>
      </div>
    </div>

    <p
      v-if="module.description"
      class="mt-6 text-lg text-muted"
      data-test="module-description"
    >
      {{ module.description }}
    </p>

    <dl class="mt-8 grid gap-4 sm:grid-cols-2">
      <div class="rounded-lg border border-default p-4">
        <dt class="text-xs font-semibold uppercase tracking-wide text-muted">
          How long it lasts
        </dt>
        <dd class="mt-1">
          {{ describeExpiry(module) }}
        </dd>
      </div>
      <div class="rounded-lg border border-default p-4">
        <dt class="text-xs font-semibold uppercase tracking-wide text-muted">
          How it is taught
        </dt>
        <dd class="mt-1">
          {{ saysDeliveryMode(module.deliveryMode) }}
        </dd>
      </div>
    </dl>

    <section
      v-if="module.prerequisites.length"
      class="mt-10"
      data-test="module-needs"
    >
      <h2 class="text-lg font-semibold">
        What you need first
      </h2>
      <ul class="mt-3 space-y-2">
        <li
          v-for="need in module.prerequisites"
          :key="need.moduleId"
        >
          <ULink
            :to="`/training/modules/${need.moduleId}`"
            class="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2 text-sm transition-colors hover:bg-elevated/50"
          >
            <span>
              <span class="font-mono text-xs text-muted">{{ need.moduleId }}</span>
              {{ need.name }}
            </span>
            <UBadge
              v-if="need.held !== null"
              :color="need.held ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ need.held ? 'Held' : 'Not yet' }}
            </UBadge>
          </ULink>
        </li>
      </ul>
    </section>

    <section
      v-if="unlocks.length"
      class="mt-10"
      data-test="module-unlocks"
    >
      <h2 class="text-lg font-semibold">
        What it leads to
      </h2>
      <ul class="mt-3 flex flex-wrap gap-2">
        <li
          v-for="one in unlocks"
          :key="one.id"
        >
          <UButton
            :to="`/training/modules/${one.id}`"
            color="neutral"
            variant="outline"
            size="sm"
          >
            {{ one.id }} {{ one.name }}
          </UButton>
        </li>
      </ul>
    </section>

    <section
      v-if="module.materials.length"
      class="mt-10"
      data-test="module-materials"
    >
      <h2 class="text-lg font-semibold">
        Material
      </h2>
      <ul class="mt-3 space-y-2">
        <li
          v-for="material in module.materials"
          :key="material.url"
        >
          <UButton
            :to="material.url"
            target="_blank"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-external-link"
          >
            {{ material.label }}
          </UButton>
        </li>
      </ul>
    </section>

    <p
      v-if="!data.signedIn"
      class="mt-10 rounded-lg border border-default p-4 text-sm text-muted"
      data-test="module-sign-in-note"
    >
      Signed in, this page shows whether you already hold it and links to the material.
    </p>
  </UContainer>
</template>
