<script setup lang="ts">
// Venues with their spaces nested (C-16). Adding a venue adds one space of the same name, so a
// theatre with one room never has to think about spaces.
definePageMeta({ layout: 'console' })

interface Space { id: string, name: string, defaultCapacity: number | null, archived: boolean }
interface Row { id: string, name: string, locality: string | null, managed: boolean, archived: boolean, spaces: Space[] }

const columns = [
  { key: 'name', label: 'Venue', card: true },
  { key: 'locality', label: 'Town or city', card: true },
  { key: 'spaces', label: 'Spaces', card: true },
]
const filters = [{
  name: 'state',
  label: 'State',
  primary: true,
  options: [{ value: 'active', label: 'In use' }, { value: 'archived', label: 'Archived' }],
}]
const { toRefusal } = useRefusal()
const creating = ref(false)
const form = reactive({ name: '', locality: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function create() {
  refusal.value = null
  try {
    const { venueId } = await $fetch<{ venueId: string }>('/api/core/venues', { method: 'POST', body: { name: form.name, locality: form.locality || null } })
    creating.value = false
    await navigateTo(`/console/programme/venues/${venueId}`)
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}

const spaceList = (row: Row) => row.spaces.filter(s => !s.archived)
  .map(s => (s.defaultCapacity ? `${s.name} (${s.defaultCapacity})` : s.name)).join(', ')
</script>

<template>
  <div>
    <PageList
      title="Venues and spaces"
      route="/api/core/venues"
      :columns="columns"
      :filters="filters"
      :row-label="(row: Row) => row.name"
      :row-to="(row: Row) => `/console/programme/venues/${row.id}`"
      :empty="{ title: 'No venues yet', description: 'A venue is a building or site the theatre performs in. Each has one or more spaces, such as a main house and a studio.', icon: 'i-lucide-building' }"
    >
      <template #primary>
        <UButton
          label="New venue"
          icon="i-lucide-plus"
          @click="creating = true"
        />
      </template>
      <template #cell-name="{ row }">
        <span class="inline-flex items-center gap-2">
          {{ row.name }}
          <UBadge
            v-if="!row.managed"
            label="Visiting"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <StatusBadge
            v-if="row.archived"
            tone="neutral"
            label="Archived"
          />
        </span>
      </template>
      <template #cell-locality="{ row }">
        {{ row.locality ?? '' }}
      </template>
      <template #cell-spaces="{ row }">
        {{ spaceList(row) }}
      </template>
    </PageList>

    <UModal
      v-model:open="creating"
      title="New venue"
      description="The venue gets one space of the same name. Add more on the venue's page."
    >
      <template #body>
        <form
          id="new-venue"
          class="space-y-4"
          @submit.prevent="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Name"
            required
            :error="refusal?.fields?.name ? refusal.reason : undefined"
          >
            <UInput
              v-model="form.name"
              maxlength="120"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Town or city"
            hint="Optional"
          >
            <UInput
              v-model="form.locality"
              maxlength="120"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="new-venue"
          label="Create venue"
          :disabled="!form.name.trim()"
        />
      </template>
    </UModal>
  </div>
</template>
