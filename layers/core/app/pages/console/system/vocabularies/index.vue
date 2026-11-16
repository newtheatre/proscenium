<script setup lang="ts">
// Every vocabulary, the platform's and the theatre's own (C-20), with "New vocabulary" for a list
// of the theatre's own.

interface Row { key: string, owner: string, label: string, description: string | null, locked: boolean, live: number, retired: number }

const { $api } = useNuxtApp()
const columns = [
  { key: 'label', label: 'Vocabulary', sortable: true, card: true },
  { key: 'owner', label: 'Belongs to', card: true },
  { key: 'live', label: 'Terms', card: true },
  { key: 'retired', label: 'Retired', card: true },
]
const filters = [{
  name: 'owner',
  label: 'Belongs to',
  primary: true,
  options: [{ value: 'core', label: 'The platform' }, { value: 'theatre', label: 'The theatre' }],
}]
const { toRefusal } = useRefusal()
const creating = ref(false)
const form = reactive({ label: '', description: '' })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function create() {
  refusal.value = null
  try {
    const { key } = await $api<{ key: string }>('/api/core/vocabularies', { method: 'POST', body: { label: form.label, description: form.description || null } })
    creating.value = false
    await navigateTo(`/console/system/vocabularies/${encodeURIComponent(key)}`)
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}
</script>

<template>
  <div>
    <PageList
      title="Vocabularies"
      route="/api/core/vocabularies"
      row-key="key"
      :columns="columns"
      :filters="filters"
      :row-label="(row: Row) => row.label"
      :row-to="(row: Row) => `/console/system/vocabularies/${encodeURIComponent(row.key)}`"
      :empty="{ title: 'No vocabularies', description: 'Vocabularies are lists of options, such as production categories, that records choose from.', icon: 'i-lucide-list-tree' }"
    >
      <template #primary>
        <UButton
          label="New vocabulary"
          icon="i-lucide-plus"
          @click="creating = true"
        />
      </template>
      <template #cell-owner="{ row }">
        {{ row.owner === 'theatre' ? 'The theatre' : row.owner }}
      </template>
      <template #cell-label="{ row }">
        <span class="inline-flex items-center gap-2">
          {{ row.label }}
          <UIcon
            v-if="row.locked"
            name="i-lucide-lock"
            class="size-4 text-muted"
            aria-label="Locked"
          />
        </span>
      </template>
    </PageList>

    <UModal
      v-model:open="creating"
      title="New vocabulary"
      description="A list of options of the theatre's own, for forms and records to choose from."
    >
      <template #body>
        <form
          id="new-vocabulary"
          class="space-y-4"
          @submit.prevent="create"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            label="Name"
            required
            :error="refusal?.fields?.label ? refusal.reason : undefined"
          >
            <UInput
              v-model="form.label"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            label="Description"
            hint="Optional"
          >
            <UTextarea
              v-model="form.description"
              maxlength="300"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="new-vocabulary"
          label="Create vocabulary"
          :disabled="!form.label.trim()"
        />
      </template>
    </UModal>
  </div>
</template>
