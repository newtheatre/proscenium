<script setup lang="ts">
import { h } from 'vue'
import { saysKind } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Recalculation', middleware: 'console' })

interface Affected {
  id: string
  userId: string
  name: string
  awardedOn: string
  expiresOn: string | null
  becomes: string | null
}

interface Preview {
  module: { id: string, name: string, department: string, kind: string }
  describes: string
  items: Affected[]
  total: number
  limit: number
  offset: number
}

interface Module { id: string, name: string, kind: string }

const PAGE = 50

const request = useRequestFetch()
const toast = useToast()
const chosen = ref<string | null>(null)
const search = ref('')
const offset = ref(0)
const echoed = ref<number | undefined>(undefined)
const failure = ref<string | null>(null)
const running = ref(false)

const { data: catalogue } = await useAsyncData(
  'admin-recalculation-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

// A brief carries no expiry policy at all, so there is nothing on one to restate (G-107).
const restatable = computed(() => catalogue.value.items.filter(module => module.kind !== 'BRIEF'))

const { data: preview, status, refresh } = await useAsyncData(
  'admin-recalculation-preview',
  () => (chosen.value
    ? request<Preview>('/api/admin/training/recalculations/preview', {
        query: { moduleId: chosen.value, limit: PAGE, offset: offset.value },
      })
    : Promise.resolve(null)),
  { watch: [chosen, offset], default: (): Preview | null => null },
)

watch(chosen, () => {
  offset.value = 0
  echoed.value = undefined
  failure.value = null
})

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  const items = preview.value?.items ?? []
  return term ? items.filter(row => row.name.toLowerCase().includes(term)) : items
})

const total = computed(() => preview.value?.total ?? 0)
const last = computed(() => Math.max(0, Math.ceil(total.value / PAGE) - 1))
const page = computed(() => Math.floor(offset.value / PAGE))

const activeFilters = computed<ActiveFilter[]>(() => (search.value
  ? [{ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } }]
  : []))

// Criterion 3 on the screen: the count has to be typed back, and the database checks it again.
const matches = computed(() => total.value > 0 && echoed.value === total.value)

async function recalculate(): Promise<void> {
  if (!chosen.value || !matches.value) return
  running.value = true
  failure.value = null
  try {
    const answered = await $fetch<{ restated: number }>('/api/admin/training/recalculations', {
      method: 'POST',
      body: { moduleId: chosen.value, expectedCount: echoed.value },
    })
    toast.add({
      title: `${plural(answered.restated, 'record')} restated`,
      description: 'Recorded on the audit trail in the same write.',
      icon: 'i-lucide-calendar-sync',
      color: 'success',
    })
    echoed.value = undefined
    offset.value = 0
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
    await refresh()
  }
  finally {
    running.value = false
  }
}

const columns: TableColumn<Affected>[] = [
  {
    id: 'person',
    header: 'Person',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.name),
      h('div', { class: 'text-xs text-muted' }, `Awarded ${row.original.awardedOn}`),
    ]),
  },
  {
    id: 'from',
    header: 'Stands at',
    meta: { class: { td: 'text-sm whitespace-nowrap' } },
    cell: ({ row }) => row.original.expiresOn ?? 'Never expires',
  },
  {
    id: 'to',
    header: 'Becomes',
    meta: { class: { td: 'text-sm font-medium whitespace-nowrap' } },
    cell: ({ row }) => row.original.becomes ?? 'Never expires',
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-calendar-sync"
      title="The only way a stamped expiry ever moves"
      description="An expiry is fixed the day a record is earned, so changing a module's policy leaves every existing record alone. This restates them from the policy as it stands now. Overridden, revoked and superseded records are always skipped, and the run is refused if the affected set changes between the preview and the confirmation."
    />

    <UFormField
      label="Which module"
      description="Its records are previewed before anything is written."
    >
      <div class="flex flex-wrap gap-1">
        <UButton
          v-for="module in restatable"
          :key="module.id"
          size="sm"
          :color="chosen === module.id ? 'primary' : 'neutral'"
          :variant="chosen === module.id ? 'solid' : 'outline'"
          :aria-pressed="chosen === module.id"
          :data-test="`module-${module.id}`"
          @click="chosen = module.id"
        >
          {{ module.id }}
        </UButton>
      </div>
    </UFormField>

    <template v-if="preview">
      <div class="rounded-lg border border-default p-4">
        <p class="font-mono text-sm">
          {{ preview.module.id }}
        </p>
        <p class="text-sm text-muted">
          {{ preview.module.name }} · {{ preview.module.department }} ·
          {{ saysKind(preview.module.kind) }} · {{ preview.describes }}
        </p>
      </div>

      <AdminToolbar
        v-model:search="search"
        placeholder="Somebody's name"
        :active="activeFilters"
        :loading="status === 'pending'"
        :filterable="false"
        @clear="search = ''"
      >
        <template #actions>
          <UButton
            v-if="last > 0"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="page === 0"
            data-test="previous-page"
            @click="offset = Math.max(0, offset - PAGE)"
          >
            Previous
          </UButton>
          <UButton
            v-if="last > 0"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="page >= last"
            data-test="next-page"
            @click="offset = offset + PAGE"
          >
            Next
          </UButton>
        </template>
      </AdminToolbar>

      <UTable
        :data="shown"
        :columns="columns"
        :loading="status === 'pending'"
        data-test="affected-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            Every record on this module already matches its policy.
          </p>
        </template>
      </UTable>

      <p
        data-test="affected-total"
        class="text-sm text-muted"
      >
        {{ plural(total, 'record') }} would be restated
      </p>

      <UFormField
        v-if="total > 0"
        label="Type the number of records back"
        description="Confirmation is the count itself. It is checked again against the database at the write, so a run whose set has moved since this preview is refused rather than applied."
      >
        <div class="flex flex-wrap items-center gap-3">
          <UInputNumber
            v-model="echoed"
            :min="0"
            class="w-40"
            data-test="echoed-count"
          />
          <UButton
            :loading="running"
            :disabled="!matches"
            data-test="recalculate"
            @click="recalculate"
          >
            Restate {{ plural(total, 'record') }}
          </UButton>
        </div>
      </UFormField>
    </template>
  </div>
</template>
