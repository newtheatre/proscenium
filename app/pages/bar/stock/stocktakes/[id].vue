<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import type { Stocktake, StocktakeLine } from '#shared/utils/stocktakes'

definePageMeta({ layout: 'console', title: 'Stocktake', middleware: 'console', docs: '/docs/bar/stocktakes' })

const route = useRoute()
const id = route.params.id as string

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const preparing = ref(false)
const applying = ref(false)
const confirming = ref(false)

const { data, status, error, refresh } = await useAsyncData(
  `bar-stocktake-${id}`,
  () => request<{ stocktake: Stocktake, lines: StocktakeLine[] }>(`/api/admin/bar/stocktakes/${id}`),
)

const open = computed(() => data.value?.stocktake.status === 'OPEN')

// Each line saves on its own (issue 1321); the register's answer replaces that one line only.
function saved(line: StocktakeLine): void {
  if (!data.value) return
  data.value = { ...data.value, lines: data.value.lines.map(one => (one.itemId === line.itemId ? line : one)) }
}

const counts = useTemplateRef<{ flush: () => Promise<boolean> }>('counts')

// Apply reads the register, so anything typed and not yet saved is saved first, and the
// confirmation names what is actually about to post (F-115 criteria 3 and 4).
async function openApply(): Promise<void> {
  preparing.value = true
  failure.value = null
  try {
    if (counts.value && !await counts.value.flush()) {
      failure.value = 'Some counts did not save, so nothing was applied. Each unsaved line says why.'
      return
    }
    await refresh()
    confirming.value = true
  }
  finally {
    preparing.value = false
  }
}

async function apply(): Promise<void> {
  applying.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/stocktakes/${id}/apply`, { method: 'POST' })
    toast.add({
      title: 'Stocktake applied',
      description: 'One adjustment movement was posted for every item that counted differently.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    confirming.value = false
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
    confirming.value = false
  }
  finally {
    applying.value = false
  }
}

const listingFailure = useListFailure(error, 'This stocktake could not be read.')

const uncounted = computed(() => data.value?.lines.filter(line => line.countedQty === null).length ?? 0)
const applyCounted = computed(() => data.value?.lines.filter(line => line.countedQty !== null).length ?? 0)
const applyNetVarianceCostPence = computed(() =>
  data.value?.lines.reduce((total, line) => total + (line.varianceCostPence ?? 0), 0) ?? 0)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
    />
    <UAlert
      v-if="failure"
      data-test="stocktake-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <template v-if="data">
      <div>
        <UBadge
          :color="open ? 'warning' : 'neutral'"
          variant="subtle"
        >
          {{ open ? 'Open' : 'Applied' }}
        </UBadge>
        <p class="mt-1 text-sm text-muted">
          Opened {{ saysWhen(data.stocktake.openedAt) }}<template v-if="data.stocktake.appliedAt">
            , applied {{ saysWhen(data.stocktake.appliedAt) }}
          </template>.
          <span data-test="uncounted-count">{{ plural(uncounted, 'item') }} not yet counted.</span>
        </p>
        <p
          v-if="open"
          class="mt-1 text-sm text-muted"
        >
          Each count saves as you type it. What each line was expected to hold shows once it is counted.
        </p>
      </div>

      <UAlert
        v-if="!open"
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        title="This stocktake is frozen"
        description="A mistake is corrected by a new stocktake or a reversing movement, never an edit here."
      />

      <StocktakeCounts
        ref="counts"
        :stocktake-id="id"
        :lines="data.lines"
        :open="open"
        @saved="saved"
      >
        <template #actions>
          <UButton
            data-test="open-apply"
            size="xl"
            :loading="preparing"
            @click="openApply"
          >
            Apply
          </UButton>
        </template>
      </StocktakeCounts>
    </template>
    <div
      v-else-if="status === 'pending'"
      data-test="stocktake-skeleton"
      class="space-y-6"
    >
      <div class="space-y-2">
        <USkeleton class="h-5 w-20" />
        <USkeleton class="h-4 w-72" />
      </div>
      <USkeleton class="h-64 w-full" />
    </div>

    <UModal
      :open="confirming"
      title="Apply this stocktake"
      description="Posts one adjustment movement per item that counted differently, then freezes the stocktake for good."
      @update:open="confirming = false"
    >
      <template #body>
        <dl
          class="space-y-1 text-sm"
          data-test="apply-summary"
        >
          <div class="flex justify-between">
            <dt class="text-muted">
              Counted
            </dt>
            <dd data-test="apply-counted">
              {{ plural(applyCounted, 'item') }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Not counted
            </dt>
            <dd data-test="apply-uncounted">
              {{ plural(uncounted, 'item') }}
            </dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-muted">
              Net variance at cost
            </dt>
            <dd data-test="apply-net-variance">
              {{ saysMoney(applyNetVarianceCostPence) }}
            </dd>
          </div>
        </dl>
      </template>

      <template #footer>
        <UButton
          data-test="confirm-apply"
          :loading="applying"
          @click="apply"
        >
          Apply
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="confirming = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
