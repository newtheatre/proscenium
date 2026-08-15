/**
 * Performance-level overrides. Buffered, since a row can mean "delete the
 * override" as readily as "write one".
 */
<script setup lang="ts">
interface PerformanceMeta {
  id: string
  showId: string
}

interface TicketTypeEntry {
  id: string
  name: string
  description?: string | null
  price: number
  activeByDefault: boolean
  showOverride: { id: string, price: number | null, active: boolean | null } | null
  perfOverride: { id: string, price: number | null, active: boolean | null } | null
  effectivePrice: number
  effectiveActive: boolean
}

interface DraftEntry {
  active: boolean
  priceStr: string
  wasReset: boolean // user wants to remove perf-level override
}

const props = defineProps<{
  performance: PerformanceMeta | null
  performanceLabel?: string
  showTitle?: string
}>()

const emit = defineEmits<{
  close: []
  refresh: []
}>()

const toast = useToast()

// ─── Data fetching (no await — see ShowTicketTypesModal for explanation) ─────────

// Nuxt types the request getter as () => NitroFetchRequest and does not model
// returning null to skip, so cast it — the runtime honours the null.
const ticketTypesUrl = () => props.performance?.id
  ? `/api/shows/${props.performance.showId}/performances/${props.performance.id}/ticket-types`
  : null
const { data: ttData, status: fetchStatus, refresh } = useFetch<TicketTypeEntry[]>(
  ticketTypesUrl as () => string,
  { immediate: false },
)

watch(() => props.performance?.id, (id, oldId) => {
  if (id) {
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

// ─── Draft mutations ───────────────────────────────────────────────────────────

function setActive(ttId: string, v: boolean) {
  if (!draft.value[ttId]) return
  draft.value[ttId] = { ...draft.value[ttId], active: v, wasReset: false }
}

function setPrice(ttId: string, v: string) {
  if (!draft.value[ttId]) return
  draft.value[ttId] = { ...draft.value[ttId], priceStr: v, wasReset: false }
}

// Reset removes only the performance-level override; reverts to show/base effective values.
// Subsequent edits set wasReset → false so the button can reappear if needed.
function resetEntry(tt: TicketTypeEntry) {
  const showEffectiveActive = tt.showOverride?.active ?? tt.activeByDefault
  const showEffectivePrice = tt.showOverride?.price ?? tt.price
  draft.value[tt.id] = {
    active: showEffectiveActive,
    priceStr: (showEffectivePrice / 100).toFixed(2),
    wasReset: true,
  }
}

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
  const perf = props.performance
  if (!perf || !tts?.length) {
    emit('close')
    return
  }

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
        if (tt.perfOverride) {
          ops.push($fetch(
            `/api/shows/${perf.showId}/performances/${perf.id}/ticket-types/${tt.id}`,
            { method: 'DELETE' },
          ))
        }
      }
      else {
        const pricePence = Math.round(parseFloat(d.priceStr) * 100)
        // Persist a price override only when it differs from the inherited price, so
        // toggling active alone does not freeze today's price.
        const inheritedPrice = tt.showOverride?.price ?? tt.price
        const priceToSend = pricePence === inheritedPrice ? null : pricePence
        if (d.active !== tt.effectiveActive || pricePence !== tt.effectivePrice) {
          ops.push($fetch(
            `/api/shows/${perf.showId}/performances/${perf.id}/ticket-types`,
            { method: 'PUT', body: { ticketTypeId: tt.id, active: d.active, price: priceToSend } },
          ))
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

function handleClose() {
  emit('close')
}

const hasDraft = computed(() => {
  return (ttData.value ?? []).some((tt) => {
    const d = draft.value[tt.id]
    if (!d) return false
    if (d.wasReset) return !!tt.perfOverride
    const p = Math.round(parseFloat(d.priceStr) * 100)
    return d.active !== tt.effectiveActive || p !== tt.effectivePrice
  })
})

const modalTitle = computed(() => {
  const parts = [props.showTitle, props.performanceLabel].filter(Boolean)
  return `Ticket types: ${parts.join(' · ')}`
})
</script>

<template>
  <UModal
    :open="!!performance"
    :title="modalTitle"
    description="Override ticket type availability and pricing for this performance only."
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
              <template v-if="draft[tt.id]?.wasReset">
                Will reset to
                <template v-if="tt.showOverride">
                  show override
                </template>
                <template v-else>
                  base
                </template>
                ·
              </template>
              <template v-else-if="tt.perfOverride">
                Performance override ·
              </template>
              <template v-else-if="tt.showOverride">
                Show override ·
              </template>
              Base: £{{ (tt.price / 100).toFixed(2) }}
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
              v-if="!draft[tt.id]?.wasReset && (tt.perfOverride !== null || isDraftChanged(tt))"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              title="Remove performance override"
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
          Overrides apply to this performance only.
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
