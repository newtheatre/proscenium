<script setup lang="ts">
import type { DeliveryMode, ExpiryMode, ModuleKind } from '#shared/utils/training'
import type { PageLink } from '@nuxt/ui'

// Public: what the theatre teaches is how somebody decides to get involved (G-128). Signing in
// adds what you already hold and nothing else. Calm: no marquee, sticker or spotlight (K-101).
useSeoMeta({
  title: 'Training',
  description: 'Every module the Nottingham New Theatre teaches, what each one needs first, and how long it lasts.',
})

interface Prerequisite { moduleId: string, name: string, held: boolean | null }
interface NextSession { id: string, heldOn: string, startsAt: string, place: string | null }

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
  held: boolean | null
  prerequisites: Prerequisite[]
  nextSession: NextSession | null
  requested: boolean | null
}

interface Catalogue {
  items: Module[]
  departments: { code: string, name: string }[]
  total: number
  signedIn: boolean
}

const search = ref('')
const department = ref<string | null>(null)

const { data, status, refresh } = await useFetch<Catalogue>('/api/training/catalogue', {
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

const asideLinks = computed<PageLink[]>(() => data.value.departments.map(one => ({
  label: one.name,
  to: `#dept-${one.code}`,
})))
</script>

<template>
  <div>
    <UPageHero
      title="What we teach"
      description="Everything at the theatre is run by students, and nearly all of it is taught here first. No experience is assumed, and nothing on this list is closed to you."
      :ui="{ title: 'nnt-headline' }"
    />

    <UContainer
      class="pb-16"
      data-test="catalogue-page"
    >
      <UPage>
        <template #left>
          <UPageAside>
            <UPageLinks
              title="Departments"
              :links="asideLinks"
            />
          </UPageAside>
        </template>

        <div class="flex flex-wrap gap-2 overflow-x-auto pb-1">
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
          <UPageSection
            v-for="group in groups"
            :id="`dept-${group.code}`"
            :key="group.code"
            :headline="group.code"
            :title="group.name"
            :ui="{ container: 'py-8 sm:py-8' }"
          >
            <UPageGrid>
              <TrainingModuleCard
                v-for="module in group.modules"
                :key="module.id"
                v-bind="module"
                :signed-in="data.signedIn"
                @requested="refresh"
              />
            </UPageGrid>
          </UPageSection>
        </div>

        <p
          v-if="!data.signedIn && data.total > 0"
          class="mt-12 rounded-lg border border-default p-4 text-sm text-muted"
        >
          Signed in, this page also shows what you already hold and links to the material for each one.
        </p>
      </UPage>
    </UContainer>
  </div>
</template>
