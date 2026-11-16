<script setup lang="ts">
// Productions (C-01): every production, with its state and season. "New production" starts a draft
// and opens it. Dates, and so the next performance, arrive with performances.
definePageMeta({ layout: 'console' })

interface Row { id: string, title: string, kind: string, state: 'draft' | 'published' | 'withdrawn' | 'cancelled', seasonId: string | null, companyName: string | null }

const { data: seasons } = await useFetch<{ rows: { id: string, name: string }[] }>('/api/core/seasons', { key: 'core:seasons:picker', query: { size: 100 } })
const columns = [
  { key: 'title', label: 'Production', sortable: true, card: true },
  { key: 'season', label: 'Season', card: true },
  { key: 'state', label: 'State', card: true },
]
const filters = computed(() => [
  { name: 'state', label: 'State', primary: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'cancelled', label: 'Cancelled' }] },
  { name: 'seasonId', label: 'Season', primary: true, options: (seasons.value?.rows ?? []).map(s => ({ value: s.id, label: s.name })) },
])
const KINDS = [{ value: 'own', label: 'Our own production' }, { value: 'visiting', label: 'A visiting company' }, { value: 'hire', label: 'A hire' }, { value: 'event', label: 'An event, such as a workshop' }]
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const
const seasonName = (id: string | null) => seasons.value?.rows.find(s => s.id === id)?.name ?? ''

const { toRefusal } = useRefusal()
const creating = ref(false)
const form = reactive({ title: '', kind: 'own' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function create() {
  refusal.value = null
  try {
    const { id } = await $fetch<{ id: string }>('/api/core/productions', { method: 'POST', body: { title: form.title, kind: form.kind } })
    creating.value = false
    await navigateTo(`/console/programme/productions/${id}`)
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}
</script>

<template>
  <PageList
    title="Productions"
    route="/api/core/productions"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.title"
    :row-to="(row: Row) => `/console/programme/productions/${row.id}`"
    :empty="{ title: 'No productions yet', description: 'A production is anything the theatre puts in front of people: its own show, a visiting company, a hire or an event.', icon: 'i-lucide-drama' }"
  >
    <template #primary>
      <UButton
        label="New production"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <template #cell-title="{ row }">
      <span>{{ row.title }}</span>
      <span
        v-if="row.companyName"
        class="text-sm text-muted"
      > · {{ row.companyName }}</span>
    </template>
    <template #cell-season="{ row }">
      {{ seasonName(row.seasonId) }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as Row['state']]"
        :label="row.state.charAt(0).toUpperCase() + row.state.slice(1)"
      />
    </template>

    <UModal
      v-model:open="creating"
      title="New production"
      description="It starts as a draft. Nothing is public until you publish it."
    >
      <template #body>
        <form
          id="new-production"
          class="space-y-4"
          @submit.prevent="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Title"
            required
          >
            <UInput
              v-model="form.title"
              maxlength="200"
              class="w-full"
            />
          </UFormField>
          <UFormField label="What it is">
            <URadioGroup
              v-model="form.kind"
              :items="KINDS"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="new-production"
          label="Create production"
          :disabled="!form.title.trim()"
        />
      </template>
    </UModal>
  </PageList>
</template>
