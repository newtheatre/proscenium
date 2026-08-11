/**
 * Show Ticket Types Modal Component
 *
 * Manages show-level ticket type availability and price overrides.
 * Changes propagate to all performances unless further overridden at the performance level.
 * All edits are buffered locally and only committed when "Save" is pressed.
 *
 * @prop show — The show to manage ticket types for (null = closed)
 * @emits close — Emitted when the modal should close (after save or cancel)
 * @emits refresh — Emitted after a successful save so the parent can refresh badges
 */
<script setup lang="ts">
interface Show {
  id: string
  title: string
}

interface Override {
  id: string
  price: number | null
  active: boolean | null
}

interface TicketTypeEntry {
  id: string
  name: string
  description?: string | null
  price: number
  activeByDefault: boolean
  override: Override | null
  effectivePrice: number
  effectiveActive: boolean
}

interface DraftEntry {
  active: boolean
  priceStr: string
  wasReset: boolean
}

const props = defineProps<{
  show: Show | null
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const toast = useToast()

// ─── Data fetching ────────────────────────────────────────────────────────────
// IMPORTANT: Do NOT use "await useFetch" in components — it suspends the entire
// parent Suspense tree, which freezes the page and breaks close handlers.
// Use useFetch (no await) with a computed URL; it re-fetches automatically.

// Nuxt types the request getter as () => NitroFetchRequest and does not model
// returning null to skip, so cast it — the runtime honours the null.
const ticketTypesUrl = () => props.show?.id ? `/api/shows/${props.show.id}/ticket-types` : null
const { data: ttData, status: fetchStatus, refresh } = useFetch<TicketTypeEntry[]>(
  ticketTypesUrl as () => string,
  { immediate: false },
)

watch(() => props.show?.id, (id, oldId) => {
  if (id) {
    // Clear stale data from a previous session before fetching fresh data.
    // Only clear when opening/switching, not when closing (id → null),
    // so the modal animates out showing the last state with no flash.
    if (id !== oldId) {
      ttData.value = undefined
      draft.value = {}
    }
    refresh()
  }
}, { immediate: true })

// ─── Local draft state ────────────────────────────────────────────────────────

const draft = ref<Record<string, DraftEntry>>({})

watch(ttData, (tts) => {
  if (!tts) return
  const d: Record<string, DraftEntry> = {}
  for (const tt of tts) {
    d[tt.id] = { active: tt.effectiveActive, priceStr: (tt.effectivePrice / 100).toFixed(2), wasReset: false }
  }
  draft.value = d
}, { immediate: true })

// ─── Draft mutations (no API calls) ──────────────────────────────────────────

function setActive(ttId: string, value: boolean) {
  if (!draft.value[ttId]) return
  draft.value[ttId] = { ...draft.value[ttId], active: value, wasReset: false }
}

function setPrice(ttId: string, value: string) {
  if (!draft.value[ttId]) return
  draft.value[ttId] = { ...draft.value[ttId], priceStr: value, wasReset: false }
}

function resetEntry(tt: TicketTypeEntry) {
  draft.value[tt.id] = { active: tt.activeByDefault, priceStr: (tt.price / 100).toFixed(2), wasReset: true }
}

// Reset button logic:
// Show when there is something to reset (server override OR local draft changes)
// and the user hasn't already pressed reset for this row.
// If reset is followed by further edits, wasReset → false and the button may reappear.
function isDraftChanged(tt: TicketTypeEntry): boolean {
  const d = draft.value[tt.id]
  if (!d) return false
  return d.active !== tt.effectiveActive
    || Math.round(parseFloat(d.priceStr) * 100) !== tt.effectivePrice
}

// ─── Save on Done ─────────────────────────────────────────────────────────────

const isSaving = ref(false)

async function handleDone() {
  const tts = ttData.value
  if (!props.show || !tts?.length) { emit('close'); return }

  for (const [ttId, d] of Object.entries(draft.value)) {
    if (!d.wasReset) {
      const p = Math.round(parseFloat(d.priceStr) * 100)
      if (Number.isNaN(p) || p < 0) {
        toast.add({ title: `Invalid price for ${tts.find(t => t.id === ttId)?.name ?? 'ticket type'}`, color: 'error' })
        return
      }
    }
  }

  isSaving.value = true
  try {
    const ops: Promise<unknown>[] = []
    for (const tt of tts) {
      const d = draft.value[tt.id]
      if (!d) continue
      if (d.wasReset) {
        if (tt.override) ops.push($fetch(`/api/shows/${props.show.id}/ticket-types/${tt.id}`, { method: 'DELETE' }))
      }
      else {
        const pricePence = Math.round(parseFloat(d.priceStr) * 100)
        // Only persist a price override when it differs from the inherited base
        // price; otherwise send null so toggling active alone doesn't pin the
        // current price as an override.
        const priceToSend = pricePence === tt.price ? null : pricePence
        if (d.active !== tt.effectiveActive || pricePence !== tt.effectivePrice) {
          ops.push($fetch(`/api/shows/${props.show.id}/ticket-types`, {
            method: 'PUT',
            body: { ticketTypeId: tt.id, active: d.active, price: priceToSend },
          }))
        }
      }
    }
    await Promise.all(ops)
    if (ops.length > 0) {
      toast.add({ title: 'Ticket types saved', icon: 'i-lucide-check', color: 'success' })
      emit('refresh')
    }
    emit('close')
  }
  catch (error: unknown) {
    toast.add({ title: 'Error saving ticket types', description: getErrorMessage(error, 'Some changes may not have been saved'), color: 'error' })
  }
  finally { isSaving.value = false }
}

function handleClose() { emit('close') }

const hasDraft = computed(() => {
  return (ttData.value ?? []).some((tt) => {
    const d = draft.value[tt.id]
    if (!d) return false
    if (d.wasReset) return !!tt.override
    const p = Math.round(parseFloat(d.priceStr) * 100)
    return d.active !== tt.effectiveActive || p !== tt.effectivePrice
  })
})
</script>

<template>
  <UModal
    :open="!!show"
    :title="`Ticket types: ${show?.title ?? ''}`"
    description="Configure which ticket types are available for this show and override prices."
    :ui="{ content: 'sm:max-w-xl' }"
    @close="handleClose"
  >
    <template #body>
      <div
        v-if="fetchStatus === 'pending'"
        class="py-8 flex justify-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-muted"
        />
      </div>

      <div
        v-else-if="!ttData?.length"
        class="py-8 text-center text-muted text-sm"
      >
        No ticket types have been created yet.
        <NuxtLink
          to="/admin/ticket-types"
          class="underline"
        >
          Manage ticket types
        </NuxtLink>
      </div>

      <div
        v-else
        class="divide-y divide-default"
      >
        <div
          v-for="tt in (ttData ?? [])"
          :key="tt.id"
          class="py-3 flex items-start gap-3"
        >
          <!-- Active switch -->
          <USwitch
            :model-value="draft[tt.id]?.active ?? tt.effectiveActive"
            class="mt-0.5 shrink-0"
            @update:model-value="(v: boolean) => setActive(tt.id, v)"
          />

          <!-- Details -->
          <div class="flex-1 min-w-0">
            <span class="font-medium text-highlighted text-sm">{{ tt.name }}</span>
            <p
              v-if="tt.description"
              class="text-xs text-muted mt-0.5"
            >
              {{ tt.description }}
            </p>
            <p class="text-xs text-muted mt-0.5">
              Base price: £{{ (tt.price / 100).toFixed(2) }}
            </p>
          </div>

          <!-- Price override -->
          <div class="flex items-center gap-1.5 shrink-0">
            <div class="relative">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">£</span>
              <UInput
                :model-value="draft[tt.id]?.priceStr ?? ''"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="w-24 pl-6"
                size="sm"
                @update:model-value="(v: string) => setPrice(tt.id, v)"
              />
            </div>
            <UButton
              v-if="!draft[tt.id]?.wasReset && (tt.override !== null || isDraftChanged(tt))"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              title="Reset to base defaults"
              @click="resetEntry(tt)"
            />
            <div
              v-else
              class="size-8"
            />
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-default flex justify-between items-center gap-2">
        <p class="text-xs text-muted">
          Changes apply to all performances unless overridden per-performance.
        </p>
        <div class="flex gap-2 shrink-0">
          <UButton
            label="Discard"
            color="neutral"
            variant="subtle"
            :disabled="isSaving"
            @click="handleClose"
          />
          <UButton
            :label="hasDraft ? 'Save' : 'Done'"
            :loading="isSaving"
            @click="handleDone"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
