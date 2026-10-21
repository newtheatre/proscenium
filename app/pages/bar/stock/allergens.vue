<script setup lang="ts">
import { ALLERGEN_STATES, says } from '#shared/utils/bar'
import type { Allergen, AllergenState, StockItem } from '#shared/utils/bar'

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

interface Draft { state: AllergenState, note: string, allergens: Allergen[] }

const drafts = ref<Record<string, Draft>>({})
const saving = ref<string | null>(null)
const failures = ref<Record<string, string>>({})

watch(data, (listed) => {
  drafts.value = Object.fromEntries(listed.items.map(item => [item.id, { state: item.allergenState, note: item.allergenNotes ?? '', allergens: [...item.allergens] }]))
}, { immediate: true })

const unanswered = computed(() => data.value.items.filter(item => item.allergenState === 'UNKNOWN').length)

// Recorded in words before answers ticked the fourteen (0142): still read out at the till, and
// asked here until somebody ticks what the words say. Never ticked by guessing at them.
const wordsOnly = (item: StockItem): boolean => item.allergenState === 'RECORDED' && item.allergens.length === 0
const untickedTotal = computed(() => data.value.items.filter(wordsOnly).length)

const changed = (item: StockItem): boolean => {
  const draft = drafts.value[item.id]
  return Boolean(draft) && (draft!.state !== item.allergenState
    || draft!.note.trim() !== (item.allergenNotes ?? '')
    || draft!.allergens.join(',') !== item.allergens.join(','))
}

function choose(item: StockItem, state: AllergenState): void {
  const draft = drafts.value[item.id]!
  draft.state = state
  if (state !== 'RECORDED') draft.allergens = []
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
        allergens: draft.state === 'RECORDED' ? draft.allergens : [],
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
  <ReadGate
    :failure="listingFailure"
    class="space-y-6"
    @retry="refresh"
  >
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

    <UAlert
      v-if="untickedTotal > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-list-checks"
      data-test="allergens-words-only"
      :title="`${plural(untickedTotal, 'stocked item')} ${untickedTotal === 1 ? 'is' : 'are'} recorded in words only`"
      description="Answers now tick the fourteen allergens. The note stays as it was written; tick what it says, and save."
    />

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

        <UBadge
          v-if="wordsOnly(item)"
          color="warning"
          variant="subtle"
          :data-test="`allergen-words-only-${item.id}`"
        >
          Recorded in words only: tick what it contains
        </UBadge>

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
            @click="choose(item, state)"
          >
            {{ says(state) }}
          </UButton>
        </div>

        <AllergenTicks
          v-if="drafts[item.id] && drafts[item.id]!.state === 'RECORDED'"
          v-model="drafts[item.id]!.allergens"
          :test-prefix="`allergen-${item.id}`"
        />

        <UTextarea
          v-if="drafts[item.id] && drafts[item.id]!.state !== 'UNKNOWN'"
          v-model="drafts[item.id]!.note"
          :rows="2"
          class="w-full"
          placeholder="Anything a tick cannot say, such as which nuts, optional"
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
  </ReadGate>
</template>
