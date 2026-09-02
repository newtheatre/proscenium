<script setup lang="ts">
import { describeExpiry, saysDeliveryMode, saysKind } from '#shared/utils/training'
import type { DeliveryMode, ExpiryMode, ModuleKind } from '#shared/utils/training'

definePageMeta({ middleware: 'signed-in' })

interface Prerequisite { moduleId: string, name: string, held: boolean }

interface Module {
  id: string
  department: string
  kind: ModuleKind
  name: string
  description: string | null
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths: number | null
  safetyCritical: boolean
  status: string
  retired: boolean
  materials: { label: string, url: string }[]
  prerequisites: Prerequisite[]
}

const request = useRequestFetch()
const search = ref('')

const { data, status } = await useAsyncData(
  'training-catalogue',
  () => request<{ items: Module[], total: number }>('/api/training/modules'),
  { default: (): { items: Module[], total: number } => ({ items: [], total: 0 }) },
)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(module =>
    [module.id, module.name, module.department].some(field => field.toLowerCase().includes(term)))
})

const groups = computed(() => {
  const byDepartment = new Map<string, Module[]>()
  for (const module of shown.value) {
    byDepartment.set(module.department, [...(byDepartment.get(module.department) ?? []), module])
  }
  return [...byDepartment.entries()].sort(([a], [b]) => a.localeCompare(b))
})
</script>

<template>
  <UContainer
    class="max-w-3xl py-16"
    data-test="catalogue-page"
  >
    <UPageHeader
      title="Training catalogue"
      description="What the theatre teaches, what each one needs first, and how long it lasts once you have it."
    />

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="A module, a department or an id"
      class="mt-6 w-full sm:w-80"
      data-test="catalogue-search"
    />

    <div
      v-if="status === 'pending'"
      class="mt-8 flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the catalogue
    </div>

    <p
      v-else-if="groups.length === 0"
      class="mt-8 text-muted"
      data-test="catalogue-empty"
    >
      {{ search ? 'Nothing in the catalogue matches that.' : 'The catalogue is empty for now.' }}
    </p>

    <div
      v-else
      class="mt-8 space-y-8"
      data-test="catalogue"
    >
      <section
        v-for="[department, modules] in groups"
        :key="department"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
          {{ department }}
        </h2>

        <ul class="mt-3 space-y-3">
          <li
            v-for="module in modules"
            :key="module.id"
            class="rounded-lg border border-default p-4"
            :data-test="`module-${module.id}`"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm text-muted">{{ module.id }}</span>
              <span class="font-medium">{{ module.name }}</span>
              <UBadge
                v-if="module.safetyCritical"
                color="error"
                variant="subtle"
                size="sm"
              >
                Safety critical
              </UBadge>
              <!-- Retired modules stay readable so a record's link resolves (criterion 5). -->
              <UBadge
                v-if="module.retired"
                color="neutral"
                variant="subtle"
                size="sm"
                :data-test="`retired-${module.id}`"
              >
                Retired
              </UBadge>
            </div>

            <p class="mt-1 text-sm text-muted">
              {{ saysKind(module.kind) }} · {{ saysDeliveryMode(module.deliveryMode) }} ·
              {{ describeExpiry(module) }}
            </p>

            <p
              v-if="module.description"
              class="mt-2 text-sm"
            >
              {{ module.description }}
            </p>

            <div
              v-if="module.prerequisites.length"
              class="mt-3"
              :data-test="`needs-${module.id}`"
            >
              <p class="text-xs font-semibold text-muted uppercase tracking-wide">
                Needs first
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                <UBadge
                  v-for="need in module.prerequisites"
                  :key="need.moduleId"
                  :color="need.held ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :data-test="`need-${module.id}-${need.moduleId}`"
                >
                  {{ need.moduleId }} {{ need.name }} · {{ need.held ? 'held' : 'not held' }}
                </UBadge>
              </div>
            </div>

            <div
              v-if="module.materials.length"
              class="mt-3 flex flex-wrap gap-3"
            >
              <ULink
                v-for="material in module.materials"
                :key="material.url"
                :to="material.url"
                target="_blank"
                class="text-sm"
              >
                {{ material.label }}
              </ULink>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </UContainer>
</template>
