<script setup lang="ts">
// Putting a person on a shift or on a bar opening's slot: one search, the route's own gate shown
// under each name (E-107 criterion 3, 0250). The caller submits the choice to its own route.
export interface AssignCandidate { id: string, name: string, email: string, eligible: boolean, reason: string | null, movable?: boolean }

const props = defineProps<{
  open: boolean
  // A performance's shift or a bar opening's slot; null while nothing is being assigned.
  target: { kind: 'shift' | 'opening', id: string } | null
  loading: boolean
  failure: string | null
}>()

const emit = defineEmits<{ close: [], assign: [candidate: AssignCandidate, move: boolean] }>()

const search = ref('')
const settled = useDebounced(search, 250)
const found = ref<AssignCandidate[]>([])
const searching = ref(false)
const chosen = ref<AssignCandidate | null>(null)
const moving = ref(false)

watch(() => [props.open, props.target?.id], () => {
  search.value = ''
  found.value = []
  chosen.value = null
  moving.value = false
})

// Only the latest answer is kept, so a slow reply to an earlier term never replaces a newer one.
let asked = 0
watch(settled, async (value) => {
  const term = value.trim()
  const target = props.target
  const mine = ++asked
  if (term.length < 2 || !target) {
    found.value = []
    return
  }
  searching.value = true
  try {
    // No options, so the widened form holds (0053); the term is encoded into the address instead.
    const encoded = `search=${encodeURIComponent(term)}`
    const answer = target.kind === 'opening'
      ? await $fetch<{ items: AssignCandidate[] }, string>(`/api/rota/openings/shifts/${target.id}/candidates?${encoded}`)
      : await $fetch<{ items: AssignCandidate[] }, string>(`/api/admin/rota/shifts/${target.id}/candidates?${encoded}`)
    if (mine === asked) found.value = answer.items
  }
  catch {
    if (mine === asked) found.value = []
  }
  finally {
    if (mine === asked) searching.value = false
  }
})

const options = computed(() => found.value.map(candidate => ({ ...candidate, value: candidate.id, label: candidate.name })))

const canAssign = computed(() => chosen.value !== null && (chosen.value.eligible || (chosen.value.movable === true && moving.value)))

function submit(): void {
  if (!chosen.value || !canAssign.value) return
  emit('assign', chosen.value, chosen.value.movable === true && moving.value)
}
</script>

<template>
  <UModal
    :open="open"
    title="Assign this shift"
    description="Search by name or address. Eligibility is checked live, the same gate self-claiming uses."
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="failure"
        class="mb-4"
        color="error"
        variant="subtle"
        :description="failure"
      />
      <div class="space-y-4">
        <UInputMenu
          class="w-full"
          :model-value="options.find(option => option.value === chosen?.id)"
          :items="options"
          :loading="searching"
          placeholder="Name or address"
          :search-input="{ icon: 'i-lucide-search' }"
          :content="{ hideWhenEmpty: true }"
          ignore-filter
          icon="i-lucide-user"
          data-test="assign-candidate"
          @update:model-value="option => chosen = option ?? null"
          @update:search-term="value => search = value"
        >
          <template #item-label="{ item }">
            <span class="flex items-center gap-1.5">
              {{ item.name }}
              <UBadge
                :color="item.eligible ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
              >
                {{ item.eligible ? 'Eligible' : 'Locked' }}
              </UBadge>
              <span
                v-if="item.reason"
                class="text-xs text-muted"
                data-test="candidate-reason"
              >{{ item.reason }}</span>
            </span>
          </template>
          <template #empty>
            <span class="text-sm text-muted">
              {{ search.trim().length < 2 ? 'Type at least two characters' : 'Nobody matches that' }}
            </span>
          </template>
        </UInputMenu>

        <UCheckbox
          v-if="chosen?.movable"
          v-model="moving"
          label="Move them off their other shift on this performance"
          description="That shift goes back to open."
          data-test="assign-move"
        />

        <UButton
          :disabled="!canAssign"
          :loading="loading"
          data-test="assign-submit"
          @click="submit"
        >
          Assign
        </UButton>
      </div>
    </template>
  </UModal>
</template>
