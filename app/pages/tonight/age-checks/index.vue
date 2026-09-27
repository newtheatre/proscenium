<script setup lang="ts">
import { AGE_CHECK_OUTCOMES, ID_TYPES, REFUSAL_REASONS, ageCheckReady, saysIdType, saysOutcome, saysRefusalReason } from '#shared/utils/age-checks'
import { saysClock } from '#shared/utils/when'
import { saysPerformanceChoice } from '#shared/utils/tonight'
import type { AgeCheckOutcome, IdType, RefusalReason } from '#shared/utils/age-checks'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/challenge-25' })
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
interface CoveredPerformance { id: string, showTitle: string, startsAt: number, venueName: string, active: boolean }

const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<number | null>(null)
const failure = ref<string | null>(null)
const busy = ref(false)
const items = ref<Entry[]>([])
// Whether anything running tonight authorises the register at all (0009's own limit, not a
// property of an entry: the row's own `performanceId` may still be null either way).
const authorised = ref(false)
const authorityFailure = ref<string | null>(null)
// A 403 alone is a refusal: a dropped connection or a lapsed session keeps the screen (issue 1304).
const refusal = ref<string | null>(null)
const performances = ref<CoveredPerformance[]>([])

type AuthorityRead = { kind: 'READ', performances: CoveredPerformance[] } | { kind: 'FAILED', failure: string, refused: boolean }

// One question for any of tonight's roles: the server tries a shift before a bypass and answers a
// refusal about the caller's own position, never the last role's (E-111).
async function readAuthority(): Promise<AuthorityRead> {
  try {
    return { kind: 'READ', performances: (await request<{ performances: CoveredPerformance[] }>('/api/tonight/authority')).performances }
  }
  catch (refused) {
    return { kind: 'FAILED', failure: refusalText(refused), refused: refusalStatus(refused) === 403 }
  }
}

function applyAuthority(answered: AuthorityRead): void {
  if (answered.kind === 'FAILED') {
    authorityFailure.value = answered.failure
    refusal.value = answered.refused ? answered.failure : null
    return
  }
  performances.value = answered.performances
  authorised.value = true
  authorityFailure.value = null
  refusal.value = null
}

type RegisterRead = { kind: 'READ', items: Entry[], at: number } | { kind: 'FAILED', failure: string }

async function readRegister(): Promise<RegisterRead> {
  try {
    return { kind: 'READ', items: (await request<Listing>('/api/tonight/age-checks', { query: { pageSize: 100 } })).items, at: Date.now() }
  }
  catch (refused) {
    return { kind: 'FAILED', failure: refusalText(refused) }
  }
}

function applyRegister(answered: RegisterRead): void {
  if (answered.kind === 'FAILED') {
    failure.value = answered.failure
    return
  }
  failure.value = null
  items.value = answered.items
  syncedAt.value = answered.at
}

async function load(): Promise<void> {
  busy.value = true
  try {
    applyRegister(await readRegister())
  }
  finally {
    busy.value = false
  }
}

// In the served page, so the register or the refusal is what a phone paints first, and the form
// below opens on the house running now (issue 1521).
const { data: served } = await useAsyncData('tonight-age-checks', async () => {
  const [authority, register] = await Promise.all([readAuthority(), readRegister()])
  return { authority, register }
})
if (served.value) {
  applyAuthority(served.value.authority)
  applyRegister(served.value.register)
}

const performanceOptions = computed(() => [
  { label: 'No performance (checked outside a show)', value: '' },
  ...performances.value.map(one => ({ label: saysPerformanceChoice(one), value: one.id })),
])

interface FormState {
  performanceId: string | null
  outcome: AgeCheckOutcome
  idType: IdType | null
  reason: RefusalReason | null
  description: string
  product: string
  notes: string
}

const blankForm = (): FormState => ({
  performanceId: (performances.value.find(one => one.active) ?? performances.value[0])?.id ?? '',
  outcome: 'ACCEPTED',
  idType: null,
  reason: null,
  description: '',
  product: '',
  notes: '',
})

const outcomeOptions = AGE_CHECK_OUTCOMES.map(value => ({ label: saysOutcome(value), value }))
const idTypeOptions = ID_TYPES.map(value => ({ label: saysIdType(value), value }))
const reasonOptions = REFUSAL_REASONS.map(value => ({ label: saysRefusalReason(value), value }))

const logging = ref(false)
const logForm = reactive<FormState>(blankForm())
const logFailure = ref<string | null>(null)
const saving = ref(false)

// Picking a side clears the other one, so a value the form has stopped asking about is never
// still sitting in it when the write goes (E-118 criterion 1). Visibly over 25 asks for neither.
function chooseOutcome(form: { outcome: AgeCheckOutcome, idType: IdType | null, reason: RefusalReason | null }, outcome: AgeCheckOutcome | null): void {
  if (!outcome) return
  form.outcome = outcome
  if (outcome !== 'ACCEPTED') form.idType = null
  if (outcome !== 'REFUSED') form.reason = null
}

// What the entry says under its description: the ID, the reason, or that no ID was asked for.
function saysBasis(entry: { outcome: AgeCheckOutcome, idType: IdType | null, reason: RefusalReason | null }): string {
  if (entry.outcome === 'ACCEPTED') return saysIdType(entry.idType!)
  if (entry.outcome === 'REFUSED') return saysRefusalReason(entry.reason!)
  return 'No ID asked for'
}

const logReady = computed(() => ageCheckReady({
  outcome: logForm.outcome,
  idType: logForm.idType,
  reason: logForm.reason,
  description: logForm.description,
}))

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
  outcome: 'ACCEPTED', idType: null, reason: null, description: '', product: '', notes: '',
})
const correctFailure = ref<string | null>(null)

const correctReady = computed(() => ageCheckReady({
  outcome: correctForm.outcome,
  idType: correctForm.idType,
  reason: correctForm.reason,
  description: correctForm.description,
}))

function openCorrect(entry: Entry): void {
  correcting.value = entry
  Object.assign(correctForm, {
    outcome: entry.outcome,
    idType: entry.idType,
    reason: entry.reason,
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
      :refused="refusal"
      hint="Every entry stays visible once filed. A mistake is corrected with a new entry, never an edit."
      :empty="!busy && items.length === 0"
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
            <span class="text-xs text-muted">{{ saysClock(entry.createdAt) }}</span>
          </div>
          <p
            v-if="entry.description"
            class="text-sm"
          >
            {{ entry.description }}
          </p>
          <p class="text-xs text-muted">
            {{ saysBasis(entry) }}
            by {{ entry.checkedByName }}
            <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
            <span v-if="entry.supersededBy"> · corrected later</span>
          </p>
          <UButton
            v-if="!entry.supersededBy"
            color="neutral"
            variant="ghost"
            class="min-h-12"
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

    <NightSheet
      v-model:open="logging"
      title="Log a Challenge 25 check"
      primary="Log the check"
      primary-test-id="log-submit"
      :primary-disabled="!logReady"
      :loading="saving"
      @primary="submitLog"
    >
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

        <!-- The routine check is two taps and a sentence: the outcome, the ID, who you saw.
             Everything the register does not need every time folds away (E-118 criterion 1). -->
        <NightChoices
          :model-value="logForm.outcome"
          label="Outcome"
          :options="outcomeOptions"
          :columns="3"
          test-id="log-outcome"
          @update:model-value="chooseOutcome(logForm, $event)"
        />

        <NightChoices
          v-if="logForm.outcome === 'ACCEPTED'"
          v-model="logForm.idType"
          label="ID shown"
          :options="idTypeOptions"
          test-id="log-id-type"
        />
        <NightChoices
          v-else-if="logForm.outcome === 'REFUSED'"
          v-model="logForm.reason"
          label="Why refused"
          :options="reasonOptions"
          :columns="1"
          test-id="log-reason"
        />

        <UFormField
          label="Who you checked"
          description="Appearance, never a name: tall man, grey coat."
          :hint="logForm.outcome === 'NOT_REQUIRED' ? 'Optional' : undefined"
        >
          <UInput
            v-model="logForm.description"
            size="xl"
            class="w-full"
            data-test="log-description"
          />
        </UFormField>

        <UCollapsible data-test="log-more">
          <UButton
            color="neutral"
            variant="subtle"
            trailing-icon="i-lucide-chevron-down"
            block
            class="min-h-12 justify-between"
            data-test="log-more-open"
          >
            House, product, note
          </UButton>

          <template #content>
            <div class="space-y-4 pt-4">
              <NightChoices
                v-if="performances.length > 0"
                v-model="logForm.performanceId"
                label="Performance"
                :options="performanceOptions"
                :columns="1"
                test-id="log-performance"
              />

              <UFormField label="Product">
                <UInput
                  v-model="logForm.product"
                  size="xl"
                  class="w-full"
                  data-test="log-product"
                />
              </UFormField>

              <UFormField label="Notes">
                <UTextarea
                  v-model="logForm.notes"
                  :rows="2"
                  class="w-full"
                  data-test="log-notes"
                />
              </UFormField>
            </div>
          </template>
        </UCollapsible>
      </form>
    </NightSheet>

    <NightSheet
      :open="correcting !== null"
      title="Correct this entry"
      primary="File the correction"
      primary-test-id="correct-submit"
      :primary-disabled="!correctReady"
      :loading="saving"
      @update:open="correcting = null"
      @primary="submitCorrect"
    >
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

        <NightChoices
          :model-value="correctForm.outcome"
          label="Outcome"
          :options="outcomeOptions"
          :columns="3"
          test-id="correct-outcome"
          @update:model-value="chooseOutcome(correctForm, $event)"
        />

        <NightChoices
          v-if="correctForm.outcome === 'ACCEPTED'"
          v-model="correctForm.idType"
          label="ID shown"
          :options="idTypeOptions"
          test-id="correct-id-type"
        />
        <NightChoices
          v-else-if="correctForm.outcome === 'REFUSED'"
          v-model="correctForm.reason"
          label="Why refused"
          :options="reasonOptions"
          :columns="1"
          test-id="correct-reason"
        />

        <UFormField
          label="Who you checked"
          description="Appearance, never a name."
          :hint="correctForm.outcome === 'NOT_REQUIRED' ? 'Optional' : undefined"
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
      </form>
    </NightSheet>
  </div>
</template>
