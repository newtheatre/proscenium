<script setup lang="ts">
import { NIGHT_ROLES } from '#shared/utils/night-authority'
import { ID_TYPES, REFUSAL_REASONS, saysIdType, saysOutcome, saysRefusalReason } from '#shared/utils/age-checks'
import { londonClock } from '#shared/utils/london'
import type { AgeCheckOutcome, IdType, RefusalReason } from '#shared/utils/age-checks'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Challenge 25 register' })

interface Entry {
  id: string
  performanceId: string | null
  checkedByName: string
  outcome: AgeCheckOutcome
  idType: IdType | null
  reason: RefusalReason | null
  description: string
  product: string | null
  notes: string | null
  supersedesId: string | null
  supersededBy: string | null
  createdAt: number
}

interface Listing { items: Entry[], total: number }

const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(true)
const items = ref<Entry[]>([])
// Whether anything running tonight authorises the register at all (0009's own limit, not a
// property of an entry: the row's own `performanceId` may still be null either way).
const authorised = ref(false)
const authorityFailure = ref<string | null>(null)
const performanceIds = ref<string[]>([])

async function resolveAuthority(): Promise<void> {
  for (const role of NIGHT_ROLES) {
    try {
      const resolved = await request<{ performanceIds: string[] }>('/api/tonight/authority', { query: { role } })
      performanceIds.value = resolved.performanceIds
      authorised.value = true
      authorityFailure.value = null
      return
    }
    catch (refused) {
      authorityFailure.value = refusalText(refused)
    }
  }
}

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const listed = await request<Listing>('/api/tonight/age-checks', { query: { pageSize: 100 } })
    items.value = listed.items
    syncedAt.value = new Date()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

onMounted(async () => {
  await resolveAuthority()
  await load()
})

const performanceOptions = computed(() => [
  { label: 'No performance (checked outside a show)', value: '' },
  ...performanceIds.value.map(id => ({ label: id, value: id })),
])

interface FormState {
  performanceId: string
  outcome: AgeCheckOutcome
  idType: IdType | undefined
  reason: RefusalReason | undefined
  description: string
  product: string
  notes: string
}

const blankForm = (): FormState => ({
  performanceId: performanceIds.value[0] ?? '',
  outcome: 'ACCEPTED',
  idType: undefined,
  reason: undefined,
  description: '',
  product: '',
  notes: '',
})

const outcomeOptions = (['ACCEPTED', 'REFUSED'] as const).map(value => ({ label: saysOutcome(value), value }))
const idTypeOptions = ID_TYPES.map(value => ({ label: saysIdType(value), value }))
const reasonOptions = REFUSAL_REASONS.map(value => ({ label: saysRefusalReason(value), value }))

const logging = ref(false)
const logForm = reactive<FormState>(blankForm())
const logFailure = ref<string | null>(null)
const saving = ref(false)

function openLog(): void {
  Object.assign(logForm, blankForm())
  logFailure.value = null
  logging.value = true
}

// The outcome names which side of the shape is asked for; the other side is never sent, since a
// value the form did not ask about is not one the reader can trust (E-118 criterion 1).
function bodyOf(form: FormState): Record<string, unknown> {
  return {
    performanceId: form.performanceId || null,
    outcome: form.outcome,
    idType: form.outcome === 'ACCEPTED' ? form.idType : null,
    reason: form.outcome === 'REFUSED' ? form.reason : null,
    description: form.description,
    product: form.product || null,
    notes: form.notes || null,
  }
}

async function submitLog(): Promise<void> {
  saving.value = true
  logFailure.value = null
  try {
    await $fetch('/api/tonight/age-checks', { method: 'POST', body: bodyOf(logForm) })
    toast.add({ title: 'Check logged', icon: 'i-lucide-check', color: 'success' })
    logging.value = false
    await load()
  }
  catch (refused) {
    logFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const correcting = ref<Entry | null>(null)
const correctForm = reactive<Omit<FormState, 'performanceId'>>({
  outcome: 'ACCEPTED', idType: undefined, reason: undefined, description: '', product: '', notes: '',
})
const correctFailure = ref<string | null>(null)

function openCorrect(entry: Entry): void {
  correcting.value = entry
  Object.assign(correctForm, {
    outcome: entry.outcome,
    idType: entry.idType ?? undefined,
    reason: entry.reason ?? undefined,
    description: entry.description,
    product: entry.product ?? '',
    notes: entry.notes ?? '',
  })
  correctFailure.value = null
}

async function submitCorrect(): Promise<void> {
  if (!correcting.value) return
  saving.value = true
  correctFailure.value = null
  try {
    await $fetch(`/api/tonight/age-checks/${correcting.value.id}/supersede`, {
      method: 'POST',
      body: bodyOf({ ...correctForm, performanceId: '' }),
    })
    toast.add({ title: 'Correction filed', icon: 'i-lucide-check', color: 'success' })
    correcting.value = null
    await load()
  }
  catch (refused) {
    correctFailure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <NightScreen
      title="Challenge 25 register"
      hint="Every entry stays visible once filed. A mistake is corrected with a new entry, never an edit."
      :stale="syncedAt"
      :busy="busy"
    >
      <UAlert
        v-if="failure"
        data-test="age-checks-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <UAlert
        v-else-if="!authorised"
        data-test="age-checks-authority-failure"
        color="warning"
        variant="subtle"
        :description="authorityFailure ?? 'Nothing tonight authorises the register.'"
      />

      <div
        v-else
        class="space-y-3"
        data-test="age-checks-list"
      >
        <p
          v-if="items.length === 0"
          class="text-muted"
        >
          Nothing logged yet tonight.
        </p>

        <div
          v-for="entry in items"
          :key="entry.id"
          class="space-y-1 rounded-lg border border-default p-3"
          :data-test="`age-check-${entry.id}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-semibold">{{ saysOutcome(entry.outcome) }}</span>
            <span class="text-xs text-muted">{{ londonClock(new Date(entry.createdAt * 1000)) }}</span>
          </div>
          <p class="text-sm">
            {{ entry.description }}
          </p>
          <p class="text-xs text-muted">
            {{ entry.outcome === 'ACCEPTED' ? saysIdType(entry.idType!) : saysRefusalReason(entry.reason!) }}
            by {{ entry.checkedByName }}
            <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
            <span v-if="entry.supersededBy"> · superseded</span>
          </p>
          <UButton
            v-if="!entry.supersededBy"
            size="xs"
            color="neutral"
            variant="ghost"
            :data-test="`correct-${entry.id}`"
            @click="openCorrect(entry)"
          >
            Correct this entry
          </UButton>
        </div>
      </div>

      <template #actions>
        <NightAction
          label="Log a check"
          icon="i-lucide-id-card"
          color="primary"
          :disabled="!authorised"
          data-test="open-log-check"
          @press="openLog"
        />
      </template>
    </NightScreen>

    <UModal
      v-model:open="logging"
      title="Log a Challenge 25 check"
      description="Timestamp and the checking person are automatic. Describe who you checked, never by name."
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="log-check-form"
          @submit.prevent="submitLog"
        >
          <UAlert
            v-if="logFailure"
            data-test="log-check-failure"
            color="error"
            variant="subtle"
            :description="logFailure"
          />

          <UFormField
            v-if="performanceIds.length > 0"
            label="Performance"
          >
            <USelect
              v-model="logForm.performanceId"
              :items="performanceOptions"
              class="w-full"
              data-test="log-performance"
            />
          </UFormField>

          <UFormField label="Outcome">
            <USelect
              v-model="logForm.outcome"
              :items="outcomeOptions"
              class="w-full"
              data-test="log-outcome"
            />
          </UFormField>

          <UFormField
            v-if="logForm.outcome === 'ACCEPTED'"
            label="ID shown"
          >
            <USelect
              v-model="logForm.idType"
              :items="idTypeOptions"
              class="w-full"
              data-test="log-id-type"
            />
          </UFormField>

          <UFormField
            v-else
            label="Why refused"
          >
            <USelect
              v-model="logForm.reason"
              :items="reasonOptions"
              class="w-full"
              data-test="log-reason"
            />
          </UFormField>

          <UFormField
            label="Who you checked"
            description="Appearance, never a name: tall man, grey coat."
          >
            <UInput
              v-model="logForm.description"
              class="w-full"
              data-test="log-description"
            />
          </UFormField>

          <UFormField
            label="Product"
            hint="Optional"
          >
            <UInput
              v-model="logForm.product"
              class="w-full"
              data-test="log-product"
            />
          </UFormField>

          <UFormField
            label="Notes"
            hint="Optional"
          >
            <UTextarea
              v-model="logForm.notes"
              :rows="2"
              class="w-full"
              data-test="log-notes"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="log-submit"
            >
              Log it
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="logging = false"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      :open="correcting !== null"
      :title="correcting ? 'Correct this entry' : ''"
      description="This files a new entry naming what it supersedes. The original stays visible."
      @update:open="correcting = null"
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="correct-check-form"
          @submit.prevent="submitCorrect"
        >
          <UAlert
            v-if="correctFailure"
            data-test="correct-check-failure"
            color="error"
            variant="subtle"
            :description="correctFailure"
          />

          <UFormField label="Outcome">
            <USelect
              v-model="correctForm.outcome"
              :items="outcomeOptions"
              class="w-full"
              data-test="correct-outcome"
            />
          </UFormField>

          <UFormField
            v-if="correctForm.outcome === 'ACCEPTED'"
            label="ID shown"
          >
            <USelect
              v-model="correctForm.idType"
              :items="idTypeOptions"
              class="w-full"
              data-test="correct-id-type"
            />
          </UFormField>

          <UFormField
            v-else
            label="Why refused"
          >
            <USelect
              v-model="correctForm.reason"
              :items="reasonOptions"
              class="w-full"
              data-test="correct-reason"
            />
          </UFormField>

          <UFormField
            label="Who you checked"
            description="Appearance, never a name."
          >
            <UInput
              v-model="correctForm.description"
              class="w-full"
              data-test="correct-description"
            />
          </UFormField>

          <UFormField
            label="Product"
            hint="Optional"
          >
            <UInput
              v-model="correctForm.product"
              class="w-full"
              data-test="correct-product"
            />
          </UFormField>

          <UFormField
            label="Notes"
            hint="Optional"
          >
            <UTextarea
              v-model="correctForm.notes"
              :rows="2"
              class="w-full"
              data-test="correct-notes"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="correct-submit"
            >
              File the correction
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="correcting = null"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
