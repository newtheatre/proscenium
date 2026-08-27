<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'

definePageMeta({ layout: 'admin', title: 'Settings', middleware: 'signed-in' })

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
  updatedAt: number | null
  updatedBy: { id: string, name: string } | null
}

const WORKSHOPS: Record<string, string> = {
  'money-and-box-office': 'Money and box office',
  'spaces-and-training': 'Spaces and training',
  'people-and-communications': 'People and communications',
}

const settings = ref<Setting[]>([])
const drafts = reactive<Record<string, string>>({})
const notices = reactive<Record<string, string>>({})
const saving = ref('')
const failure = ref<string | null>(null)

const grouped = computed(() => Object.keys(WORKSHOPS).map(workshop => ({
  workshop,
  title: WORKSHOPS[workshop]!,
  settings: settings.value.filter(setting => setting.workshop === workshop),
})))

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

function kind(setting: Setting): 'boolean' | 'number' | 'text' {
  const value = standing(setting)
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  return 'text'
}

async function load(): Promise<void> {
  const answer = await $fetch<{ settings: Setting[] }>('/api/admin/config')
  settings.value = answer.settings
  for (const setting of answer.settings) drafts[setting.key] = asText(standing(setting))
}

async function save(setting: Setting, value: unknown): Promise<void> {
  saving.value = setting.key
  failure.value = null
  notices[setting.key] = ''

  try {
    await $fetch(`/api/admin/config/${setting.key}`, { method: 'PUT', body: { value } })
    await load()
    notices[setting.key] = 'Saved'
  }
  catch (error) {
    failure.value = `${setting.key}: ${refusalText(error)}`
  }
  finally {
    saving.value = ''
  }
}

// A key that holds a string keeps the text as typed: parsing it first would turn 08-01 into a
// number and true into a boolean, and the schema would refuse a value the officer typed correctly.
function saveText(setting: Setting): Promise<void> {
  const raw = drafts[setting.key] ?? ''
  if (kind(setting) === 'number') return save(setting, Number(raw))
  if (typeof standing(setting) === 'string') return save(setting, raw)

  try {
    return save(setting, JSON.parse(raw))
  }
  catch {
    return save(setting, raw)
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-8">
    <p class="text-sm text-muted">
      Every operational number the system enforces. A change takes effect on the next request, so
      committee decisions are settings changes rather than releases.
    </p>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <section
      v-for="group in grouped"
      :key="group.workshop"
      class="space-y-3"
    >
      <h2 class="nnt-headline text-lg">
        {{ group.title }}
      </h2>

      <div
        v-for="setting in group.settings"
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
          </div>
          <div class="flex gap-1">
            <UBadge
              v-if="!setting.enforced"
              color="warning"
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
            @update:model-value="save(setting, $event)"
          />
          <template v-else>
            <UInput
              v-model="drafts[setting.key]"
              :type="kind(setting) === 'number' ? 'number' : 'text'"
              :data-test="`input-${setting.key}`"
              class="min-w-64 flex-1 font-mono"
            />
            <UButton
              variant="subtle"
              :loading="saving === setting.key"
              :data-test="`save-${setting.key}`"
              @click="saveText(setting)"
            >
              Save
            </UButton>
          </template>

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
    </section>
  </div>
</template>
