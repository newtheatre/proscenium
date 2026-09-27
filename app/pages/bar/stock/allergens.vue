<script setup lang="ts">
import { ALLERGEN_STATES, says } from '#shared/utils/bar'
import type { AllergenState, StockItem } from '#shared/utils/bar'

// The one review table (issue 1348): every live stocked item, unanswered first, answered in place.
// A product takes its answer from what it pours, so each item is answered once, here.
definePageMeta({ layout: 'console', title: 'Allergens', middleware: 'console', docs: '/docs/bar/stock' })

interface Listing { items: StockItem[], total: number, pageSize: number, pages: number }

const request = useRequestFetch()
const toast = useToast()

const { data, error, refresh } = await useAsyncData(
  'bar-allergens',
  // The page cap, which no bar's stock register comes near.
  () => request<Listing>('/api/admin/bar/items', { query: { retired: 'false', sort: 'allergens', pageSize: MAX_PAGE_SIZE } }),
  { default: (): Listing => ({ items: [], total: 0, pageSize: 0, pages: 1 }) },
)

interface Draft { state: AllergenState, note: string }

const drafts = ref<Record<string, Draft>>({})
const saving = ref<string | null>(null)
const failures = ref<Record<string, string>>({})

watch(data, (listed) => {
  drafts.value = Object.fromEntries(listed.items.map(item => [item.id, { state: item.allergenState, note: item.allergenNotes ?? '' }]))
}, { immediate: true })

const unanswered = computed(() => data.value.items.filter(item => item.allergenState === 'UNKNOWN').length)

const changed = (item: StockItem): boolean => {
  const draft = drafts.value[item.id]
  return Boolean(draft) && (draft!.state !== item.allergenState || draft!.note.trim() !== (item.allergenNotes ?? ''))
}

// The edit route takes the whole item, so everything but the answer goes back as it was read.
async function save(item: StockItem): Promise<void> {
  const draft = drafts.value[item.id]!
  saving.value = item.id
  failures.value[item.id] = ''
  try {
    await $fetch(`/api/admin/bar/items/${item.id}`, {
      method: 'PUT',
      body: {
        name: item.name,
        unit: item.unit,
        containerMl: item.containerMl,
        parQty: item.parQty,
        category: item.category,
        ageRestricted: item.ageRestricted,
        allergenState: draft.state,
        allergenNotes: draft.state === 'UNKNOWN' ? null : draft.note.trim() || null,
      },
    })
    toast.add({ title: `${item.name} answered`, icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (refused) {
    failures.value[item.id] = refusalText(refused)
  }
  finally {
    saving.value = null
  }
}

const listingFailure = useListFailure(error, 'The stocked items could not be read.')
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
    />

    <p class="text-sm text-muted">
      Answer each stocked item once, and every product that pours it gives that answer at the till,
      with anything the bar adds, such as a garnish, set on the product itself.
    </p>

    <p
      class="text-sm font-medium"
      data-test="allergens-left"
    >
      {{ unanswered === 0 ? 'Every stocked item is answered.' : `${plural(unanswered, 'stocked item')} still to answer.` }}
    </p>

    <ul class="divide-y divide-default rounded-md border border-default">
      <li
        v-for="item in data.items"
        :key="item.id"
        class="space-y-3 p-4"
        :data-test="`allergen-row-${item.id}`"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="font-medium">
            {{ item.name }}
          </p>
          <p class="text-xs text-muted">
            {{ item.pouredBy.length ? `Poured by ${item.pouredBy.map(product => product.name).join(', ')}` : 'Nothing on the till pours it' }}
          </p>
        </div>

        <div
          v-if="drafts[item.id]"
          class="flex flex-wrap gap-2"
        >
          <UButton
            v-for="state in ALLERGEN_STATES"
            :key="state"
            :color="drafts[item.id]!.state === state ? 'primary' : 'neutral'"
            :variant="drafts[item.id]!.state === state ? 'solid' : 'subtle'"
            class="min-h-12"
            :data-test="`allergen-${item.id}-${state}`"
            @click="drafts[item.id]!.state = state"
          >
            {{ says(state) }}
          </UButton>
        </div>

        <UTextarea
          v-if="drafts[item.id] && drafts[item.id]!.state !== 'UNKNOWN'"
          v-model="drafts[item.id]!.note"
          :rows="2"
          class="w-full"
          :placeholder="drafts[item.id]!.state === 'RECORDED' ? 'What staff read out at the bar' : 'Anything worth saying, optional'"
          :aria-label="`Allergen note for ${item.name}`"
          :data-test="`allergen-note-${item.id}`"
        />

        <p
          v-if="failures[item.id]"
          class="text-sm text-error"
        >
          {{ failures[item.id] }}
        </p>

        <UButton
          v-if="changed(item)"
          :loading="saving === item.id"
          class="min-h-12"
          :data-test="`allergen-save-${item.id}`"
          @click="save(item)"
        >
          Save the answer for {{ item.name }}
        </UButton>
      </li>
    </ul>
  </div>
</template>
