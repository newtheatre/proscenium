<script setup lang="ts">
import { can, manageBoardConfig } from '#shared/utils/abilities'

definePageMeta({ layout: 'console', title: 'Backstage board', middleware: 'console', docs: '/docs/rota/backstage-board-setup' })

interface MilestoneType { id: string, label: string, sort: number, active: boolean }
interface Preset { id: string, label: string, body: string, sort: number, active: boolean }

const toast = useToast()
const writes = computed(() => can(useViewer().value, manageBoardConfig))
const failure = ref<string | null>(null)

// Typed explicitly (0053): inferring it from the route map alone has grown too deep for tsc.
const { data: typesData, status: typesStatus, refresh: refreshTypes } = await useAsyncData(
  'backstage-milestone-types',
  () => useRequestFetch()<{ types: MilestoneType[] }>('/api/admin/backstage/milestone-types'),
  { default: (): { types: MilestoneType[] } => ({ types: [] }) },
)

const { data: presetsData, status: presetsStatus, refresh: refreshPresets } = await useAsyncData(
  'backstage-presets',
  () => useRequestFetch()<{ presets: Preset[] }>('/api/admin/backstage/presets'),
  { default: (): { presets: Preset[] } => ({ presets: [] }) },
)

const saving = ref(false)

// Milestone types
const editingType = ref<MilestoneType | null>(null)
const typeOpen = ref(false)
const typeState = reactive({ label: '', sort: 0 })

function addType(): void {
  editingType.value = null
  Object.assign(typeState, { label: '', sort: typesData.value.types.length })
  failure.value = null
  typeOpen.value = true
}

function editType(type: MilestoneType): void {
  editingType.value = type
  Object.assign(typeState, { label: type.label, sort: type.sort })
  failure.value = null
  typeOpen.value = true
}

async function saveType(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    if (editingType.value) await $fetch<unknown>(`/api/admin/backstage/milestone-types/${editingType.value.id}`, { method: 'PUT', body: typeState })
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    else await $fetch<unknown>('/api/admin/backstage/milestone-types', { method: 'POST', body: typeState })
    toast.add({ title: editingType.value ? 'Milestone type changed' : 'Milestone type added', icon: 'i-lucide-check', color: 'success' })
    typeOpen.value = false
    await refreshTypes()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

// Retiring confirms; reinstating does not (K-123 criterion 7).
const retiringType = ref<MilestoneType | null>(null)
const typeFailure = ref<string | null>(null)
const typeWorking = ref(false)

async function retireType(): Promise<void> {
  const type = retiringType.value
  if (!type) return
  typeWorking.value = true
  typeFailure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(`/api/admin/backstage/milestone-types/${type.id}/status`, { method: 'POST', body: { active: false } })
    toast.add({ title: 'Milestone type retired', icon: 'i-lucide-check', color: 'success' })
    retiringType.value = null
    await refreshTypes()
  }
  catch (error) {
    typeFailure.value = refusalText(error)
  }
  finally {
    typeWorking.value = false
  }
}

function toggleType(type: MilestoneType): void {
  if (!type.active) return void setTypeActive(type, true)
  typeFailure.value = null
  retiringType.value = type
}

async function setTypeActive(type: MilestoneType, active: boolean): Promise<void> {
  failure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(`/api/admin/backstage/milestone-types/${type.id}/status`, { method: 'POST', body: { active } })
    toast.add({ title: active ? 'Milestone type reinstated' : 'Milestone type retired', icon: 'i-lucide-check', color: 'success' })
    await refreshTypes()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

// Presets
const editingPreset = ref<Preset | null>(null)
const presetOpen = ref(false)
const presetState = reactive({ label: '', body: '', sort: 0 })

function addPreset(): void {
  editingPreset.value = null
  Object.assign(presetState, { label: '', body: '', sort: presetsData.value.presets.length })
  failure.value = null
  presetOpen.value = true
}

function editPreset(preset: Preset): void {
  editingPreset.value = preset
  Object.assign(presetState, { label: preset.label, body: preset.body, sort: preset.sort })
  failure.value = null
  presetOpen.value = true
}

async function savePreset(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    if (editingPreset.value) await $fetch<unknown>(`/api/admin/backstage/presets/${editingPreset.value.id}`, { method: 'PUT', body: presetState })
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    else await $fetch<unknown>('/api/admin/backstage/presets', { method: 'POST', body: presetState })
    toast.add({ title: editingPreset.value ? 'Preset changed' : 'Preset added', icon: 'i-lucide-check', color: 'success' })
    presetOpen.value = false
    await refreshPresets()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

const retiringPreset = ref<Preset | null>(null)
const presetFailure = ref<string | null>(null)
const presetWorking = ref(false)

async function retirePreset(): Promise<void> {
  const preset = retiringPreset.value
  if (!preset) return
  presetWorking.value = true
  presetFailure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(`/api/admin/backstage/presets/${preset.id}/status`, { method: 'POST', body: { active: false } })
    toast.add({ title: 'Preset retired', icon: 'i-lucide-check', color: 'success' })
    retiringPreset.value = null
    await refreshPresets()
  }
  catch (error) {
    presetFailure.value = refusalText(error)
  }
  finally {
    presetWorking.value = false
  }
}

function togglePreset(preset: Preset): void {
  if (!preset.active) return void setPresetActive(preset, true)
  presetFailure.value = null
  retiringPreset.value = preset
}

async function setPresetActive(preset: Preset, active: boolean): Promise<void> {
  failure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(`/api/admin/backstage/presets/${preset.id}/status`, { method: 'POST', body: { active } })
    toast.add({ title: active ? 'Preset reinstated' : 'Preset retired', icon: 'i-lucide-check', color: 'success' })
    await refreshPresets()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => typeOpen.value || presetOpen.value || retiringType.value !== null || retiringPreset.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      The message types and presets the board offers.
    </p>

    <UCard data-test="milestone-types">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            Milestone types
          </h2>
          <UButton
            v-if="writes"
            size="sm"
            variant="subtle"
            data-test="add-milestone-type"
            @click="addType"
          >
            Add a milestone type
          </UButton>
        </div>
      </template>

      <div class="space-y-2">
        <div
          v-for="type in typesData.types"
          :key="type.id"
          class="flex items-center justify-between gap-2 border-b border-default py-2 last:border-0"
        >
          <span class="text-sm">{{ type.label }}<span
            v-if="!type.active"
            class="ml-2 text-xs text-muted"
          >(retired)</span></span>
          <div
            v-if="writes"
            class="flex gap-1"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :data-test="`edit-type-${type.id}`"
              @click="editType(type)"
            >
              Edit
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :data-test="`retire-type-${type.id}`"
              @click="toggleType(type)"
            >
              {{ type.active ? 'Retire' : 'Reinstate' }}
            </UButton>
          </div>
        </div>
        <p
          v-if="typesStatus !== 'pending' && typesData.types.length === 0"
          class="py-6 text-center text-sm text-muted"
        >
          No milestone types yet.
        </p>
      </div>
    </UCard>

    <UCard data-test="presets">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">
            Presets
          </h2>
          <UButton
            v-if="writes"
            size="sm"
            variant="subtle"
            data-test="add-preset"
            @click="addPreset"
          >
            Add a preset
          </UButton>
        </div>
      </template>

      <div class="space-y-2">
        <div
          v-for="preset in presetsData.presets"
          :key="preset.id"
          class="flex items-center justify-between gap-2 border-b border-default py-2 last:border-0"
        >
          <div>
            <p class="text-sm">
              {{ preset.label }}<span
                v-if="!preset.active"
                class="ml-2 text-xs text-muted"
              >(retired)</span>
            </p>
            <p class="text-xs text-muted">
              {{ preset.body }}
            </p>
          </div>
          <div
            v-if="writes"
            class="flex gap-1"
          >
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :data-test="`edit-preset-${preset.id}`"
              @click="editPreset(preset)"
            >
              Edit
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :data-test="`retire-preset-${preset.id}`"
              @click="togglePreset(preset)"
            >
              {{ preset.active ? 'Retire' : 'Reinstate' }}
            </UButton>
          </div>
        </div>
        <p
          v-if="presetsStatus !== 'pending' && presetsData.presets.length === 0"
          class="py-6 text-center text-sm text-muted"
        >
          No presets yet.
        </p>
      </div>
    </UCard>

    <UModal
      v-model:open="typeOpen"
      :title="editingType ? 'Edit milestone type' : 'Add a milestone type'"
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
          <UFormField label="Label">
            <UInput
              v-model="typeState.label"
              class="w-full"
              data-test="type-label"
            />
          </UFormField>
          <UFormField
            label="Order"
            description="Lowest first."
          >
            <UInputNumber
              v-model="typeState.sort"
              :min="0"
              class="w-full"
              data-test="type-sort"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!typeState.label.trim()"
          data-test="type-submit"
          @click="saveType"
        >
          Save it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="typeOpen = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <UModal
      v-model:open="presetOpen"
      :title="editingPreset ? 'Edit preset' : 'Add a preset'"
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
          <UFormField
            label="Button label"
            description="What the one-tap button says."
          >
            <UInput
              v-model="presetState.label"
              class="w-full"
              data-test="preset-label"
            />
          </UFormField>
          <UFormField
            label="Message"
            description="What is actually sent."
          >
            <UTextarea
              v-model="presetState.body"
              class="w-full"
              data-test="preset-body"
            />
          </UFormField>
          <UFormField
            label="Order"
            description="Lowest first."
          >
            <UInputNumber
              v-model="presetState.sort"
              :min="0"
              class="w-full"
              data-test="preset-sort"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!presetState.label.trim() || !presetState.body.trim()"
          data-test="preset-submit"
          @click="savePreset"
        >
          Save it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="presetOpen = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="retiringType !== null"
      name="retire-type"
      :title="retiringType ? `Retire ${retiringType.label}` : ''"
      :verb="retiringType ? `Retire ${retiringType.label}` : ''"
      consequence="No new milestone is set against it. Milestones already on a board stay where they are."
      :loading="typeWorking"
      :failure="typeFailure"
      @update:open="value => { if (!value) retiringType = null }"
      @confirm="retireType"
    />

    <ConfirmModal
      :open="retiringPreset !== null"
      name="retire-preset"
      :title="retiringPreset ? `Retire ${retiringPreset.label}` : ''"
      :verb="retiringPreset ? `Retire ${retiringPreset.label}` : ''"
      consequence="It stops being offered on the board. Messages already sent with it are untouched."
      :loading="presetWorking"
      :failure="presetFailure"
      @update:open="value => { if (!value) retiringPreset = null }"
      @confirm="retirePreset"
    />
  </div>
</template>
