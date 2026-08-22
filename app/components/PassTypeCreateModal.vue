<!--
Create a pass product. Pick the covered shows explicitly: the scope is a
list, not a rule, and stays editable afterwards (ADR-0002).
-->
<script setup lang="ts">
interface ShowOption {
  id: string
  title: string
  status: string
  performances: Array<{ startsAt: string | number }>
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean], 'created': [] }>()

const modelOpen = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
})

const toast = useToast()

const name = ref('')
const description = ref('')
const validFrom = ref('')
const validTo = ref('')
const maxIssued = ref<number | undefined>(undefined)
const selectedShowIds = ref<string[]>([])
const prices = ref([
  { label: 'Public', price: '35.00' },
  { label: 'NNT Member', price: '28.00' },
])
const saving = ref(false)

/** Slug is derived from the name, the same convention the show form uses. */
const slug = computed(() =>
  name.value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''),
)

// Only shows with a future performance are plausible pass scope: the imported
// archive would otherwise swamp the picker.
const { data: shows } = useFetch<Paginated<ShowOption>>('/api/shows', {
  query: { scope: 'upcoming', view: 'options', limit: 500 },
  lazy: true,
  default: (): Paginated<ShowOption> => ({ rows: [], total: 0, page: 1, limit: 500 }),
})

const showOptions = computed(() =>
  (shows.value?.rows ?? []).map(s => ({ label: s.title, value: s.id })),
)

function addPrice() {
  prices.value = [...prices.value, { label: '', price: '0.00' }]
}

function removePrice(index: number) {
  prices.value = prices.value.filter((_, i) => i !== index)
}

const canSave = computed(() =>
  !!name.value.trim() && !!validFrom.value && !!validTo.value
  && prices.value.length > 0
  && prices.value.every(p => p.label.trim() && !Number.isNaN(Number(p.price))),
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    await $fetch('/api/pass-types', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        slug: slug.value,
        description: description.value.trim() || null,
        validFrom: validFrom.value,
        validTo: validTo.value,
        maxIssued: maxIssued.value ?? null,
        prices: prices.value.map(p => ({
          label: p.label.trim(),
          price: Math.round(Number(p.price) * 100),
        })),
        showIds: selectedShowIds.value,
      },
    })
    toast.add({ title: 'Pass type created', icon: 'i-lucide-check-circle', color: 'success' })
    emit('created')
    modelOpen.value = false
    name.value = ''
    description.value = ''
    validFrom.value = ''
    validTo.value = ''
    maxIssued.value = undefined
    selectedShowIds.value = []
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not create the pass type',
      description: getErrorMessage(error, 'Please check the details and try again'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="modelOpen"
    title="New pass type"
    description="A pass product: what it is called, when it is valid, what it costs and which shows it covers."
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          label="Name"
          required
        >
          <UInput
            v-model="name"
            placeholder="Autumn 2026 Season Pass"
            class="w-full"
          />
          <template
            v-if="slug"
            #help
          >
            Slug: <span class="font-mono">{{ slug }}</span>
          </template>
        </UFormField>

        <UFormField label="Description">
          <UTextarea
            v-model="description"
            :rows="2"
            placeholder="One admission to every In House and Studio show this season."
            class="w-full"
          />
        </UFormField>

        <div class="grid sm:grid-cols-2 gap-3">
          <UFormField
            label="Valid from"
            required
          >
            <UInput
              v-model="validFrom"
              type="date"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Valid to"
            required
          >
            <UInput
              v-model="validTo"
              type="date"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Maximum issued">
          <UInput
            v-model.number="maxIssued"
            type="number"
            min="1"
            placeholder="No limit"
            class="w-full"
          />
          <template #help>
            A hard cap, checked at the point of sale. A pass does not reserve a
            seat, so this is the protection against selling more passes than the
            house can hold.
          </template>
        </UFormField>

        <!-- Prices -->
        <UFormField label="Prices">
          <div class="space-y-2">
            <div
              v-for="(price, i) in prices"
              :key="i"
              class="flex items-center gap-2"
            >
              <UInput
                v-model="price.label"
                placeholder="Public"
                class="flex-1"
                :aria-label="`Price ${i + 1} label`"
              />
              <UInput
                v-model="price.price"
                type="number"
                step="0.01"
                min="0"
                class="w-28"
                :aria-label="`Price ${i + 1} amount in pounds`"
              >
                <template #leading>
                  £
                </template>
              </UInput>
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="prices.length === 1"
                :aria-label="`Remove price ${i + 1}`"
                @click="removePrice(i)"
              />
            </div>
            <UButton
              label="Add price"
              icon="i-lucide-plus"
              variant="ghost"
              size="xs"
              @click="addPrice"
            />
          </div>
          <template #help>
            Variants of one product, so there is a single show list and the
            member and public versions cannot drift apart in what they cover.
          </template>
        </UFormField>

        <UFormField label="Shows covered">
          <USelectMenu
            v-model="selectedShowIds"
            :items="showOptions"
            value-key="value"
            multiple
            searchable
            placeholder="Select shows"
            class="w-full"
          />
          <template #help>
            Only shows with an upcoming performance are listed. Editable later:
            adding a show grants it to every existing holder.
          </template>
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          label="Cancel"
          variant="ghost"
          color="neutral"
          :disabled="saving"
          @click="modelOpen = false"
        />
        <UButton
          label="Create"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
