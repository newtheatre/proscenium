<!--
  Show-level ticket type availability and price overrides, editable in place.

  Converted from a modal. Edits are still buffered locally and committed together
  on save — that part was right, because a row here can mean "delete the
  override" as easily as "write one", and applying each toggle immediately would
  make a half-finished price change permanent.

  What changed is that it no longer opens and closes: a show's prices are a
  property of the show, so they sit on the show's page. Prices set here apply to
  every performance unless a performance overrides them itself.
-->
<script setup lang="ts">
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

const props = defineProps<{ showId: string }>()
const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()

// No `await`: awaiting useFetch in a component suspends the parent Suspense
// tree. A computed URL re-fetches when the show changes.
const ticketTypesUrl = () => `/api/shows/${props.showId}/ticket-types`
const { data: ttData, status: fetchStatus, refresh } = useFetch<TicketTypeEntry[]>(
  ticketTypesUrl as () => string,
  { lazy: true, default: () => [] },
)

// ── Local draft ──────────────────────────────────────────────────────────────

const draft = ref<Record<string, DraftEntry>>({})

watch(ttData, (entries) => {
  const next: Record<string, DraftEntry> = {}
  for (const entry of entries ?? []) {
    next[entry.id] = {
      active: entry.effectiveActive,
      priceStr: (entry.effectivePrice / 100).toFixed(2),
      wasReset: false,
    }
  }
  draft.value = next
}, { immediate: true })

function setActive(id: string, value: boolean) {
  if (!draft.value[id]) return
  draft.value[id] = { ...draft.value[id], active: value, wasReset: false }
}

function setPrice(id: string, value: string) {
  if (!draft.value[id]) return
  draft.value[id] = { ...draft.value[id], priceStr: value, wasReset: false }
}

function resetEntry(entry: TicketTypeEntry) {
  draft.value[entry.id] = {
    active: entry.activeByDefault,
    priceStr: (entry.price / 100).toFixed(2),
    wasReset: true,
  }
}

/** Whether this row differs from what the server currently resolves for it. */
function isDraftChanged(entry: TicketTypeEntry): boolean {
  const d = draft.value[entry.id]
  if (!d) return false
  return d.active !== entry.effectiveActive
    || Math.round(Number.parseFloat(d.priceStr) * 100) !== entry.effectivePrice
}

const hasDraft = computed(() =>
  (ttData.value ?? []).some((entry) => {
    const d = draft.value[entry.id]
    if (!d) return false
    if (d.wasReset) return !!entry.override
    return isDraftChanged(entry)
  }),
)

function discard() {
  const next: Record<string, DraftEntry> = {}
  for (const entry of ttData.value ?? []) {
    next[entry.id] = {
      active: entry.effectiveActive,
      priceStr: (entry.effectivePrice / 100).toFixed(2),
      wasReset: false,
    }
  }
  draft.value = next
}

// ── Save ─────────────────────────────────────────────────────────────────────

const isSaving = ref(false)

async function save() {
  const entries = ttData.value ?? []
  if (!entries.length) return

  for (const [id, d] of Object.entries(draft.value)) {
    if (d.wasReset) continue
    const pence = Math.round(Number.parseFloat(d.priceStr) * 100)
    if (Number.isNaN(pence) || pence < 0) {
      toast.add({
        title: `Invalid price for ${entries.find(e => e.id === id)?.name ?? 'ticket type'}`,
        color: 'error',
      })
      return
    }
  }

  isSaving.value = true
  try {
    const ops: Promise<unknown>[] = []
    for (const entry of entries) {
      const d = draft.value[entry.id]
      if (!d) continue

      if (d.wasReset) {
        if (entry.override) {
          ops.push($fetch(`/api/shows/${props.showId}/ticket-types/${entry.id}`, { method: 'DELETE' }))
        }
        continue
      }

      const pence = Math.round(Number.parseFloat(d.priceStr) * 100)
      // Only persist a price override when it differs from the inherited base
      // price; otherwise send null, so toggling availability alone does not pin
      // today's price as an override that outlives the next price change.
      const priceToSend = pence === entry.price ? null : pence
      if (d.active !== entry.effectiveActive || pence !== entry.effectivePrice) {
        ops.push($fetch(`/api/shows/${props.showId}/ticket-types`, {
          method: 'PUT',
          body: { ticketTypeId: entry.id, active: d.active, price: priceToSend },
        }))
      }
    }

    await Promise.all(ops)
    if (ops.length > 0) {
      toast.add({ title: 'Ticket types saved', icon: 'i-lucide-check', color: 'success' })
      emit('refresh')
    }
    await refresh()
  }
  catch (error: unknown) {
    toast.add({
      title: 'Error saving ticket types',
      description: getErrorMessage(error, 'Some changes may not have been saved'),
      color: 'error',
    })
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <section
    id="ticket-types"
    class="space-y-3"
  >
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
        Ticket types
      </h2>
      <span class="text-xs text-muted">
        Applies to every performance unless overridden per-performance
      </span>
    </div>

    <UCard>
      <div
        v-if="fetchStatus === 'pending'"
        class="py-8 flex justify-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-6 animate-spin text-muted"
        />
      </div>

      <UEmpty
        v-else-if="!ttData?.length"
        icon="i-lucide-ticket"
        title="No ticket types have been created yet"
        description="Ticket types are defined once and reused across shows."
      >
        <template #actions>
          <UButton
            to="/admin/ticket-types"
            label="Manage ticket types"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </template>
      </UEmpty>

      <template v-else>
        <div class="divide-y divide-default">
          <div
            v-for="entry in ttData"
            :key="entry.id"
            class="py-3 flex flex-wrap items-start gap-3"
          >
            <USwitch
              :model-value="draft[entry.id]?.active ?? entry.effectiveActive"
              class="mt-0.5 shrink-0"
              :aria-label="`${entry.name} available`"
              @update:model-value="(v: boolean) => setActive(entry.id, v)"
            />

            <div class="flex-1 min-w-40">
              <span class="font-medium text-highlighted text-sm">{{ entry.name }}</span>
              <p
                v-if="entry.description"
                class="text-xs text-muted mt-0.5"
              >
                {{ entry.description }}
              </p>
              <p class="text-xs text-muted mt-0.5">
                Base price: {{ formatMoney(entry.price) }}
              </p>
            </div>

            <div class="flex items-center gap-1.5 shrink-0">
              <div class="relative">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-sm">£</span>
                <UInput
                  :model-value="draft[entry.id]?.priceStr ?? ''"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="w-24 pl-6"
                  size="sm"
                  :aria-label="`${entry.name} price`"
                  @update:model-value="(v: string) => setPrice(entry.id, v)"
                />
              </div>
              <UButton
                v-if="!draft[entry.id]?.wasReset && (entry.override !== null || isDraftChanged(entry))"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="ghost"
                size="sm"
                square
                title="Reset to base defaults"
                :aria-label="`Reset ${entry.name} to defaults`"
                @click="resetEntry(entry)"
              />
              <div
                v-else
                class="size-8"
              />
            </div>
          </div>
        </div>

        <div class="pt-3 mt-3 border-t border-default flex flex-wrap justify-end gap-2">
          <UButton
            label="Discard changes"
            color="neutral"
            variant="ghost"
            :disabled="!hasDraft || isSaving"
            @click="discard"
          />
          <UButton
            label="Save ticket types"
            :disabled="!hasDraft"
            :loading="isSaving"
            @click="save"
          />
        </div>
      </template>
    </UCard>
  </section>
</template>
