<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { coversThrough, lastCovered, londonDate } from '#shared/utils/working-days'
import { confirmationOptions } from '#shared/utils/blast-radius'
import type { BlastRadiusPreview } from '#shared/utils/blast-radius'

definePageMeta({ layout: 'console', title: 'Settings', middleware: 'console' })

// A holiday list that has run out refuses requests near the horizon, so it says how far it
// reaches before anybody is refused rather than at the moment they are (C-121, 0038).
const HORIZON_WEEKS = 12

function coverage(setting: { key: string, value: unknown, default: unknown }): { says: string, short: boolean } | null {
  if (setting.key !== 'BANK_HOLIDAYS') return null

  const dates = (Array.isArray(setting.value) ? setting.value : setting.default) as string[] | undefined
  if (!Array.isArray(dates)) return null

  const horizon = new Date(Date.now() + HORIZON_WEEKS * 7 * 86_400_000)
  const reach = lastCovered(dates)
  if (!reach) return { says: 'No dates recorded, so every request for a room not listed here is refused.', short: true }

  return coversThrough(dates, horizon)
    ? { says: `Covers to ${reach}.`, short: false }
    : { says: `Covers only to ${reach}, and requests are judged as far as ${londonDate(horizon)}. Anything past ${reach} is refused.`, short: true }
}

interface Setting {
  key: string
  workshop: string
  describes: string
  default: unknown
  hasDefault: boolean
  value: unknown
  set: boolean
  enforced: boolean
  sensitive: boolean
  wideBlastRadius: boolean
  updatedAt: number | null
  updatedBy: { id: string, name: string } | null
}

const WORKSHOPS: Record<string, string> = {
  'money-and-box-office': 'Money and box office',
  'spaces-and-training': 'Spaces and training',
  'people-and-communications': 'People and communications',
}

const search = ref('')
const settings = ref<Setting[]>([])
const drafts = reactive<Record<string, string>>({})
const notices = reactive<Record<string, string>>({})
const saving = ref('')
const failure = ref<ListFailure | null>(null)

const grouped = computed(() => Object.keys(WORKSHOPS).map(workshop => ({
  workshop,
  title: WORKSHOPS[workshop]!,
  settings: settings.value.filter(setting => setting.workshop === workshop && matches(setting)),
})))

// One group on screen at a time, and a search that reaches across all of them: a count on the tab
// says where a match is without opening it.
const tabs = computed(() => grouped.value.map(group => ({
  label: group.title,
  value: group.workshop,
  badge: group.settings.length,
  slot: 'group' as const,
})))

const tab = ref(Object.keys(WORKSHOPS)[0]!)
const shown = computed(() => grouped.value.find(group => group.workshop === tab.value)?.settings ?? [])

// A search that empties the tab you are on has found its match somewhere else.
watch(search, () => {
  if (shown.value.length) return
  const found = grouped.value.find(group => group.settings.length)
  if (found) tab.value = found.workshop
})

// The value a key stands at: its override, or what it ships with.
function standing(setting: Setting): unknown {
  return setting.set ? setting.value : (setting.hasDefault ? setting.default : null)
}

// An unset key shows an empty box, not the JSON for an empty string: the first thing a workshop
// does is fill these in, and a value that looks pre-filled invites saving it back.
function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : JSON.stringify(value)
}

// Money is entered in pounds and stored in pence, everywhere (0004, 0032). The key says which
// keys those are, because the schema only knows it is an integer.
function kind(setting: Setting): 'boolean' | 'money' | 'number' | 'list' | 'text' {
  const value = standing(setting)
  if (typeof value === 'boolean') return 'boolean'
  if (setting.key.endsWith('_PENCE')) return 'money'
  if (typeof value === 'number') return 'number'
  if (Array.isArray(value) || Array.isArray(setting.default)) return 'list'
  return 'text'
}

// Held apart from the text drafts, because a number input round-trips a number and turning it
// into a string and back is how a value picks up a decimal it never had.
const numbers = reactive<Record<string, number>>({})
const lists = reactive<Record<string, string[]>>({})

// Fifty keys is too many to scroll for one. Matched on the name and on what it describes, because
// somebody looking for the tab cap may not remember it is called BAR_TAB_CAP_PENCE.
function matches(setting: Setting): boolean {
  const term = search.value.trim().toLowerCase()
  if (!term) return true
  return setting.key.toLowerCase().includes(term) || setting.describes.toLowerCase().includes(term)
}

async function load(): Promise<void> {
  const answer = await $fetch<{ settings: Setting[] }>('/api/admin/config')
  settings.value = answer.settings
  for (const setting of answer.settings) {
    drafts[setting.key] = asText(standing(setting))
    const value = standing(setting)
    if (typeof value === 'number') numbers[setting.key] = value
    if (Array.isArray(value)) lists[setting.key] = value.map(String)
  }
}

async function save(setting: Setting, value: unknown, confirmation?: string): Promise<void> {
  saving.value = setting.key
  failure.value = null
  notices[setting.key] = ''

  try {
    await $fetch(`/api/admin/config/${setting.key}`, { method: 'PUT', body: { value, confirmation } })
    await load()
    notices[setting.key] = 'Saved'
  }
  catch (error) {
    failure.value = { message: `${setting.key}: ${refusalText(error)}`, enrolPath: enrolPath(error) }
  }
  finally {
    saving.value = ''
  }
}

// A flagged save previews its blast radius before anything is asked to confirm (J-105 criteria
// 1, 5): the modal opens on a loading preview rather than waiting to show the typed-echo field.
const confirming = ref<Setting | null>(null)
const pendingValue = ref<unknown>(null)
const confirmationText = ref('')
const preview = ref<BlastRadiusPreview | null>(null)
const previewLoading = ref(false)

const confirmOptions = computed(() => confirming.value ? confirmationOptions(confirming.value.key, preview.value) : [])
const confirmationValid = computed(() => confirmOptions.value.includes(confirmationText.value.trim()))

async function attemptSave(setting: Setting, value: unknown): Promise<void> {
  if (!setting.wideBlastRadius) {
    await save(setting, value)
    return
  }

  confirming.value = setting
  pendingValue.value = value
  confirmationText.value = ''
  preview.value = null
  previewLoading.value = true
  try {
    preview.value = await $fetch<BlastRadiusPreview>(`/api/admin/config/${setting.key}/blast-radius`)
  }
  catch {
    preview.value = null
  }
  finally {
    previewLoading.value = false
  }
}

async function confirmSave(): Promise<void> {
  if (!confirming.value || !confirmationValid.value) return
  const setting = confirming.value
  await save(setting, pendingValue.value, confirmationText.value.trim())
  confirming.value = null
}

const reverting = ref('')

// One action, no second confirmation: undoing carries none of a new change's own uncertainty
// about what is about to happen (J-105 criterion 3).
async function revert(setting: Setting): Promise<void> {
  reverting.value = setting.key
  failure.value = null
  notices[setting.key] = ''

  try {
    await $fetch(`/api/admin/config/${setting.key}/revert`, { method: 'POST' })
    await load()
    notices[setting.key] = 'Reverted'
  }
  catch (error) {
    failure.value = { message: `${setting.key}: ${refusalText(error)}`, enrolPath: enrolPath(error) }
  }
  finally {
    reverting.value = ''
  }
}

// Pounds on the screen, pence in the database, converted here and nowhere else (0004).
const pounds = (pence: number | undefined): number => (pence ?? 0) / 100
const pence = (amount: number | undefined): number => Math.round((amount ?? 0) * 100)

// A key that holds a string keeps the text as typed: parsing it first would turn 08-01 into a
// number and true into a boolean, and the schema would refuse a value the officer typed correctly.
function saveText(setting: Setting): Promise<void> {
  const raw = drafts[setting.key] ?? ''
  if (kind(setting) === 'number') return attemptSave(setting, Number(raw))
  if (typeof standing(setting) === 'string') return attemptSave(setting, raw)

  try {
    return attemptSave(setting, JSON.parse(raw))
  }
  catch {
    return attemptSave(setting, raw)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      Every operational number the system enforces. A change takes effect on the next request, so
      committee decisions are settings changes rather than releases.
    </p>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure.message"
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
    />

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="A key, or what it decides"
      class="w-full sm:w-96"
      data-test="config-search"
    />

    <UTabs
      v-model="tab"
      :items="tabs"
      variant="link"
      :ui="{ trigger: 'grow' }"
    >
      <template #group>
        <div class="mt-4 space-y-3">
          <p
            v-if="!shown.length"
            class="py-6 text-center text-sm text-muted"
            data-test="config-empty"
          >
            No setting in this group matches that.
          </p>

          <div
            v-for="setting in shown"
            :key="setting.key"
            :data-test="`setting-${setting.key}`"
            class="rounded-lg border border-default p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="space-y-1">
                <p class="font-mono text-sm">
                  {{ setting.key }}
                </p>
                <p class="text-sm text-muted">
                  {{ setting.describes }}
                </p>
                <p
                  v-if="coverage(setting)"
                  class="text-sm"
                  :class="coverage(setting)!.short ? 'text-error' : 'text-muted'"
                  :data-test="`coverage-${setting.key}`"
                >
                  {{ coverage(setting)!.says }}
                </p>
              </div>
              <div class="flex gap-1">
                <UBadge
                  v-if="setting.wideBlastRadius"
                  color="warning"
                  variant="subtle"
                  size="sm"
                  :data-test="`blast-radius-${setting.key}`"
                >
                  Wide blast radius
                </UBadge>
                <UBadge
                  v-if="!setting.enforced"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Not enforced yet
                </UBadge>
                <UBadge
                  v-if="!setting.hasDefault && !setting.set"
                  color="error"
                  variant="subtle"
                  size="sm"
                >
                  Not set
                </UBadge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-3">
              <USwitch
                v-if="kind(setting) === 'boolean'"
                :model-value="standing(setting) === true"
                :loading="saving === setting.key"
                :data-test="`toggle-${setting.key}`"
                @update:model-value="attemptSave(setting, $event)"
              />

              <template v-else-if="kind(setting) === 'money'">
                <UInputNumber
                  :model-value="pounds(numbers[setting.key])"
                  :min="0"
                  :step="0.5"
                  :format-options="{ style: 'currency', currency: 'GBP' }"
                  class="w-48"
                  :data-test="`input-${setting.key}`"
                  @update:model-value="numbers[setting.key] = pence($event as number)"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="saving === setting.key"
                  :data-test="`save-${setting.key}`"
                  @click="attemptSave(setting, numbers[setting.key])"
                >
                  Save
                </UButton>
              </template>

              <template v-else-if="kind(setting) === 'number'">
                <UInputNumber
                  v-model="numbers[setting.key]"
                  :min="0"
                  class="w-40"
                  :data-test="`input-${setting.key}`"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="saving === setting.key"
                  :data-test="`save-${setting.key}`"
                  @click="attemptSave(setting, numbers[setting.key])"
                >
                  Save
                </UButton>
              </template>

              <template v-else-if="kind(setting) === 'list'">
                <UInputTags
                  v-model="lists[setting.key]"
                  class="min-w-64 flex-1"
                  :data-test="`input-${setting.key}`"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="saving === setting.key"
                  :data-test="`save-${setting.key}`"
                  @click="attemptSave(setting, lists[setting.key] ?? [])"
                >
                  Save
                </UButton>
              </template>

              <template v-else>
                <UInput
                  v-model="drafts[setting.key]"
                  :data-test="`input-${setting.key}`"
                  class="min-w-64 flex-1 font-mono"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="saving === setting.key"
                  :data-test="`save-${setting.key}`"
                  @click="saveText(setting)"
                >
                  Save
                </UButton>
              </template>

              <UButton
                v-if="setting.set"
                color="neutral"
                variant="ghost"
                icon="i-lucide-undo-2"
                :loading="reverting === setting.key"
                :data-test="`revert-${setting.key}`"
                @click="revert(setting)"
              >
                Revert
              </UButton>

              <span
                v-if="notices[setting.key]"
                class="text-sm text-muted"
              >{{ notices[setting.key] }}</span>
            </div>

            <p class="mt-2 text-xs text-muted">
              <span v-if="setting.hasDefault">Ships as <span class="font-mono">{{ asText(setting.default) }}</span>. </span>
              <span v-if="setting.updatedBy && setting.updatedAt">
                Changed by {{ setting.updatedBy.name }} on
                {{ formatLondon(new Date(setting.updatedAt * 1000), { dateStyle: 'long' }) }}.
              </span>
              <span v-else>Never changed.</span>
            </p>
          </div>
        </div>
      </template>
    </UTabs>

    <UModal
      :open="confirming !== null"
      :title="confirming ? `Confirm: ${confirming.key}` : ''"
      description="This setting is flagged wide blast radius. Read the count before you type either option below (J-105)."
      @update:open="confirming = null"
    >
      <template #body>
        <div
          v-if="confirming"
          class="space-y-4"
        >
          <p
            v-if="previewLoading"
            class="text-sm text-muted"
          >
            Working out who this affects…
          </p>
          <UAlert
            v-else-if="preview"
            color="warning"
            variant="subtle"
            :data-test="`blast-radius-preview-${confirming.key}`"
            :description="`${preview.count} ${preview.category}.`"
          />
          <UAlert
            v-else
            color="error"
            variant="subtle"
            description="No live preview for this setting. Type the setting's own name to confirm."
          />

          <UFormField :label="`Type ${confirmOptions.map(option => `“${option}”`).join(' or ')} to confirm`">
            <UInput
              v-model="confirmationText"
              data-test="blast-radius-confirmation"
              class="w-full font-mono"
              @keyup.enter="confirmationValid && confirmSave()"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          @click="confirming = null"
        >
          Cancel
        </UButton>
        <UButton
          color="warning"
          :disabled="!confirmationValid"
          :loading="Boolean(confirming) && saving === confirming!.key"
          data-test="blast-radius-confirm"
          @click="confirmSave"
        >
          Save anyway
        </UButton>
      </template>
    </UModal>
  </div>
</template>
