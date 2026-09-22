<script setup lang="ts">
import { NIGHT_ROLES } from '#shared/utils/night-authority'
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

const syncedAt = ref<Date | null>(null)
const failure = ref<string | null>(null)
const busy = ref(true)
const items = ref<Entry[]>([])
// Whether anything running tonight authorises the register at all (0009's own limit, not a
// property of an entry: the row's own `performanceId` may still be null either way).
const authorised = ref(false)
const authorityFailure = ref<string | null>(null)
const performances = ref<CoveredPerformance[]>([])

async function resolveAuthority(): Promise<void> {
  for (const role of NIGHT_ROLES) {
    try {
      const resolved = await request<{ performances: CoveredPerformance[] }>('/api/tonight/authority', { query: { role } })
      performances.value = resolved.performances
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
  ...performances.value.map(one => ({ label: saysPerformanceChoice(one), value: one.id })),
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
  performanceId: (performances.value.find(one => one.active) ?? performances.value[0])?.id ?? '',
  outcome: 'ACCEPTED',
  idType: undefined,
  reason: undefined,
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
function chooseOutcome(form: { outcome: AgeCheckOutcome, idType: IdType | undefined, reason: RefusalReason | undefined }, outcome: AgeCheckOutcome): void {
  form.outcome = outcome
  if (outcome !== 'ACCEPTED') form.idType = undefined
  if (outcome !== 'REFUSED') form.reason = undefined
}

// What the entry says under its description: the ID, the reason, or that no ID was asked for.
function saysBasis(entry: { outcome: AgeCheckOutcome, idType: IdType | null, reason: RefusalReason | null }): string {
  if (entry.outcome === 'ACCEPTED') return saysIdType(entry.idType!)
  if (entry.outcome === 'REFUSED') return saysRefusalReason(entry.reason!)
  return 'No ID asked for'
}

const logReady = computed(() => ageCheckReady({
  outcome: logForm.outcome,
  idType: logForm.idType ?? null,
  reason: logForm.reason ?? null,
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
  outcome: 'ACCEPTED', idType: undefined, reason: undefined, description: '', product: '', notes: '',
})
const correctFailure = ref<string | null>(null)

const correctReady = computed(() => ageCheckReady({
  outcome: correctForm.outcome,
  idType: correctForm.idType ?? null,
  reason: correctForm.reason ?? null,
  description: correctForm.description,
}))

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

    <UModal
      v-model:open="logging"
      title="Log a Challenge 25 check"
      description="The time and your name go on it. Describe who you checked, never by name."
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

          <!-- The routine check is two taps and a sentence: the outcome, the ID, who you saw.
               Everything the register does not need every time folds away (E-118 criterion 1). -->
          <UFormField label="Outcome">
            <div
              class="grid grid-cols-3 gap-2"
              data-test="log-outcome"
            >
              <UButton
                v-for="option in outcomeOptions"
                :key="option.value"
                :color="logForm.outcome === option.value ? 'primary' : 'neutral'"
                :variant="logForm.outcome === option.value ? 'solid' : 'subtle'"
                size="lg"
                class="min-h-12 justify-center font-semibold"
                :data-test="`log-outcome-${option.value}`"
                @click="chooseOutcome(logForm, option.value)"
              >
                {{ option.label }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            v-if="logForm.outcome !== 'NOT_REQUIRED'"
            :label="logForm.outcome === 'ACCEPTED' ? 'ID shown' : 'Why refused'"
          >
            <div
              v-if="logForm.outcome === 'ACCEPTED'"
              class="grid grid-cols-2 gap-2"
              data-test="log-id-type"
            >
              <UButton
                v-for="option in idTypeOptions"
                :key="option.value"
                :color="logForm.idType === option.value ? 'primary' : 'neutral'"
                :variant="logForm.idType === option.value ? 'solid' : 'subtle'"
                class="min-h-12 justify-center"
                :data-test="`log-id-type-${option.value}`"
                @click="logForm.idType = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
            <div
              v-else
              class="grid gap-2"
              data-test="log-reason"
            >
              <UButton
                v-for="option in reasonOptions"
                :key="option.value"
                :color="logForm.reason === option.value ? 'primary' : 'neutral'"
                :variant="logForm.reason === option.value ? 'solid' : 'subtle'"
                class="min-h-12 justify-center"
                :data-test="`log-reason-${option.value}`"
                @click="logForm.reason = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
          </UFormField>

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
                <UFormField
                  v-if="performances.length > 0"
                  label="Performance"
                >
                  <USelect
                    v-model="logForm.performanceId"
                    :items="performanceOptions"
                    size="xl"
                    class="w-full"
                    data-test="log-performance"
                  />
                </UFormField>

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

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              size="lg"
              class="min-h-12"
              :loading="saving"
              :disabled="!logReady"
              data-test="log-submit"
            >
              Log the check
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-12"
              @click="logging = false"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal
      :open="correcting !== null"
      :title="correcting ? 'Correct this entry' : ''"
      description="This files a new entry. The original stays visible."
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
            <div
              class="grid grid-cols-3 gap-2"
              data-test="correct-outcome"
            >
              <UButton
                v-for="option in outcomeOptions"
                :key="option.value"
                :color="correctForm.outcome === option.value ? 'primary' : 'neutral'"
                :variant="correctForm.outcome === option.value ? 'solid' : 'subtle'"
                size="lg"
                class="min-h-12 justify-center font-semibold"
                :data-test="`correct-outcome-${option.value}`"
                @click="chooseOutcome(correctForm, option.value)"
              >
                {{ option.label }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            v-if="correctForm.outcome !== 'NOT_REQUIRED'"
            :label="correctForm.outcome === 'ACCEPTED' ? 'ID shown' : 'Why refused'"
          >
            <div
              v-if="correctForm.outcome === 'ACCEPTED'"
              class="grid grid-cols-2 gap-2"
              data-test="correct-id-type"
            >
              <UButton
                v-for="option in idTypeOptions"
                :key="option.value"
                :color="correctForm.idType === option.value ? 'primary' : 'neutral'"
                :variant="correctForm.idType === option.value ? 'solid' : 'subtle'"
                class="min-h-12 justify-center"
                :data-test="`correct-id-type-${option.value}`"
                @click="correctForm.idType = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
            <div
              v-else
              class="grid gap-2"
              data-test="correct-reason"
            >
              <UButton
                v-for="option in reasonOptions"
                :key="option.value"
                :color="correctForm.reason === option.value ? 'primary' : 'neutral'"
                :variant="correctForm.reason === option.value ? 'solid' : 'subtle'"
                class="min-h-12 justify-center"
                :data-test="`correct-reason-${option.value}`"
                @click="correctForm.reason = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
          </UFormField>

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

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              class="min-h-12"
              :loading="saving"
              :disabled="!correctReady"
              data-test="correct-submit"
            >
              File the correction
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              class="min-h-12"
              @click="correcting = null"
            >
              {{ CONFIRM_BACK_LABEL }}
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
