<script setup lang="ts">
import { describeExpiry, saysKind } from '#shared/utils/training'
import type { ExpiryMode, ModuleKind } from '#shared/utils/training'

// Public: what the theatre teaches is how somebody decides to get involved (G-128). Signing in
// adds what you already hold and nothing else.
useSeoMeta({
  title: 'Training',
  description: 'Every module the Nottingham New Theatre teaches, what each one needs first, and how long it lasts.',
})

interface Module {
  id: string
  department: string
  departmentName: string
  kind: ModuleKind
  name: string
  description: string | null
  expiryMode: ExpiryMode
  expiryMonths: number | null
  safetyCritical: boolean
  held: boolean | null
}

interface Catalogue {
  items: Module[]
  departments: { code: string, name: string }[]
  total: number
  signedIn: boolean
}

const search = ref('')
const department = ref<string | null>(null)

const { data, status } = await useFetch<Catalogue>('/api/training/catalogue', {
  default: (): Catalogue => ({ items: [], departments: [], total: 0, signedIn: false }),
})

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  return data.value.items.filter(module =>
    (!department.value || module.department === department.value)
    && (!term || [module.id, module.name, module.departmentName].some(field => field.toLowerCase().includes(term))))
})

const groups = computed(() => data.value.departments
  .map(one => ({ ...one, modules: shown.value.filter(module => module.department === one.code) }))
  .filter(group => group.modules.length > 0))
</script>

<template>
  <UContainer
    class="max-w-4xl py-16"
    data-test="catalogue-page"
  >
    <div class="space-y-3">
      <h1 class="nnt-headline text-4xl">
        What we teach
      </h1>
      <p class="max-w-2xl text-lg text-muted">
        Everything at the theatre is run by students, and nearly all of it is taught here first. No
        experience is assumed, and nothing on this list is closed to you.
      </p>
    </div>

    <div class="mt-8 flex flex-wrap gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="A module, or a department"
        class="w-full sm:w-80"
        data-test="catalogue-search"
      />
      <UButton
        :color="department === null ? 'primary' : 'neutral'"
        :variant="department === null ? 'solid' : 'outline'"
        size="sm"
        @click="department = null"
      >
        Everything
      </UButton>
      <UButton
        v-for="one in data.departments"
        :key="one.code"
        :color="department === one.code ? 'primary' : 'neutral'"
        :variant="department === one.code ? 'solid' : 'outline'"
        size="sm"
        :data-test="`catalogue-department-${one.code}`"
        @click="department = one.code"
      >
        {{ one.name }}
      </UButton>
    </div>

    <p
      v-if="status === 'pending'"
      class="py-12 text-center text-muted"
    >
      Reading the catalogue
    </p>

    <p
      v-else-if="shown.length === 0"
      class="py-12 text-center text-muted"
      data-test="catalogue-empty"
    >
      Nothing matches that.
    </p>

    <div data-test="catalogue">
      <section
        v-for="group in groups"
        :key="group.code"
        class="mt-12"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">
          {{ group.name }}
        </h2>

        <ul class="mt-4 grid gap-3 sm:grid-cols-2">
          <li
            v-for="module in group.modules"
            :key="module.id"
          >
            <ULink
              :to="`/training/modules/${module.id}`"
              class="flex h-full flex-col gap-2 rounded-lg border border-default p-4 transition-colors hover:bg-elevated/50"
              :data-test="`catalogue-module-${module.id}`"
            >
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-muted">{{ module.id }}</span>
                <UBadge
                  v-if="module.safetyCritical"
                  color="warning"
                  variant="subtle"
                  size="sm"
                >
                  Safety critical
                </UBadge>
                <UBadge
                  v-if="module.held"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  You hold this
                </UBadge>
              </span>
              <span class="font-semibold">{{ module.name }}</span>
              <span
                v-if="module.description"
                class="line-clamp-3 text-sm text-muted"
              >
                {{ module.description }}
              </span>
              <span class="mt-auto pt-1 text-xs text-muted">
                {{ saysKind(module.kind) }} · {{ describeExpiry(module) }}
              </span>
            </ULink>
          </li>
        </ul>
      </section>
    </div>

    <p
      v-if="!data.signedIn && data.total > 0"
      class="mt-12 rounded-lg border border-default p-4 text-sm text-muted"
    >
      Signed in, this page also shows what you already hold and links to the material for each one.
    </p>
  </UContainer>
</template>
