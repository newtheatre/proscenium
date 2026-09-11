<script setup lang="ts">
import {
  DELIVERY_MODES,
  EXPIRY_MODES,
  MAX_EXPIRY_MONTHS,
  MODULE_KINDS,
  MODULE_LIFECYCLE,
  describeExpiry,
  moduleForm,
  newModuleForm,
  saysDeliveryMode,
  saysKind,
  saysLifecycle,
} from '#shared/utils/training'
import type { CatalogueModule } from './CatalogueTable.vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { DeliveryMode, ExpiryMode, ModuleInput, ModuleKind, ModuleLifecycle } from '#shared/utils/training'

// The module form, moved out whole from the manage page (G-129): same markers, same handlers.
// A frozen field is a fact about existing records, not a rule the form invents (G-109).

interface Material { label: string, url: string }
interface Department { code: string, name: string }

const props = defineProps<{
  open: boolean
  module: CatalogueModule | null
  departments: Department[]
  candidates: CatalogueModule[]
}>()

const emit = defineEmits<{ 'update:open': [boolean], 'saved': [], 'failed': [message: string] }>()

const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

interface FormState {
  id: string
  department: string
  kind: ModuleKind
  name: string
  description?: string
  notes?: string
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths?: number
  allowsExternal: boolean
  externalEvidence?: string
  safetyCritical: boolean
  signoffRequired: boolean
  grantsTrainer: boolean
  grantsSupervisor: boolean
  selfRegistrable: boolean
  status: ModuleLifecycle
  sort: number
  materials: Material[]
}

const state = reactive<FormState>(blank())

// Every key, including the ones that may be absent: this is assigned over the last form's state,
// so a field left out here keeps whatever the module before it had.
function blank(): FormState {
  return {
    id: '',
    department: '',
    kind: 'MODULE',
    name: '',
    description: undefined,
    notes: undefined,
    deliveryMode: 'IN_PERSON',
    expiryMode: 'NONE',
    expiryMonths: undefined,
    allowsExternal: false,
    externalEvidence: undefined,
    safetyCritical: false,
    signoffRequired: false,
    grantsTrainer: false,
    grantsSupervisor: false,
    selfRegistrable: false,
    status: 'DRAFT',
    sort: 0,
    materials: [],
  }
}

// Reinitialised every time the modal opens, from whatever module the page asked to edit.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  failure.value = null
  const module = props.module
  Object.assign(state, blank(), module
    ? {
        id: module.id,
        department: module.department,
        kind: module.kind,
        name: module.name,
        description: module.description ?? undefined,
        notes: module.notes ?? undefined,
        deliveryMode: module.deliveryMode,
        expiryMode: module.expiryMode,
        expiryMonths: module.expiryMonths ?? undefined,
        allowsExternal: module.allowsExternal,
        externalEvidence: module.externalEvidence ?? undefined,
        safetyCritical: module.safetyCritical,
        signoffRequired: module.signoffRequired,
        grantsTrainer: module.grantsTrainer,
        grantsSupervisor: module.grantsSupervisor,
        selfRegistrable: module.selfRegistrable,
        status: module.status,
        sort: module.sort,
        materials: module.materials.map(material => ({ ...material })),
      }
    : { department: props.departments[0]?.code ?? '' })
})

// Records against the module fix what it means, so the screen says so rather than offering an edit
// the write path will refuse (G-109).
const frozen = computed(() => props.module?.frozen === true)

const departmentOptions = computed(() => props.departments
  .map(one => ({ label: `${one.code} ${one.name}`, value: one.code })))

const kindOptions = MODULE_KINDS.map(option => ({ label: saysKind(option), value: option }))
const lifecycleOptions = MODULE_LIFECYCLE.map(option => ({ label: saysLifecycle(option), value: option }))

// A safety-critical module may never be fully self-directed, so that mode is not offered rather
// than offered and refused (G-107 criterion 2).
const modeOptions = computed(() => DELIVERY_MODES
  .filter(option => !(state.safetyCritical && option === 'SELF_DIRECTED'))
  .map(option => ({ label: saysDeliveryMode(option), value: option })))

const expiryOptions = computed(() => EXPIRY_MODES
  .map(option => ({
    label: describeExpiry({ expiryMode: option, expiryMonths: state.expiryMonths ?? null }),
    value: option,
  })))

// Only a certification confers standing (G-111). An older module that already carries it keeps the
// switches on screen, because clearing one silently would be refused later as a frozen change.
const confersStanding = computed(() =>
  state.kind === 'CERTIFICATION' || state.grantsTrainer || state.grantsSupervisor)

// Every field the form hides is cleared here, in one place, so a rule and the field it governs
// cannot drift apart: what is not shown is never what gets submitted (G-107 criteria 2 and 4).
watch(
  () => [state.kind, state.expiryMode, state.safetyCritical, state.allowsExternal] as const,
  () => {
    if (state.kind === 'BRIEF') {
      state.expiryMode = 'NONE'
      state.allowsExternal = false
    }
    else {
      state.selfRegistrable = false
    }
    if (state.kind !== 'CERTIFICATION') {
      state.grantsTrainer = false
      state.grantsSupervisor = false
    }
    state.expiryMonths = state.expiryMode === 'MONTHS' ? (state.expiryMonths ?? 12) : undefined
    if (!state.allowsExternal) state.externalEvidence = undefined
    if (state.safetyCritical && state.deliveryMode === 'SELF_DIRECTED') state.deliveryMode = 'HYBRID'
  },
)

function addMaterial(): void {
  state.materials.push({ label: '', url: '' })
}

async function save(event: FormSubmitEvent<ModuleInput & { id?: string }>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (props.module) {
      await $fetch(`/api/admin/training/modules/${props.module.id}`, { method: 'PUT', body: event.data })
    }
    else {
      await $fetch('/api/admin/training/modules', { method: 'POST', body: event.data })
    }
    toast.add({ title: props.module ? 'Module changed' : 'Module added', icon: 'i-lucide-check', color: 'success' })
    emit('update:open', false)
    emit('saved')
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="module ? `Edit ${module.id}` : 'Add a module'"
    description="The published id is what members quote and what a certificate carries, so it is fixed once the module exists."
    @update:open="value => emit('update:open', value)"
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="failure"
        color="error"
        variant="subtle"
        :description="failure"
        class="mb-4"
      />

      <UForm
        :schema="module ? moduleForm : newModuleForm"
        :state="state"
        class="space-y-4"
        data-test="module-form"
        @submit="save"
      >
        <UFormField
          v-if="!module"
          label="Published id"
          name="id"
          required
          description="Uppercase letters, digits and hyphens. TECH-111, FOH-101."
        >
          <UInput
            v-model="state.id"
            class="w-full"
            data-test="module-id"
          />
        </UFormField>

        <UFormField
          label="Title"
          name="name"
          required
        >
          <UInput
            v-model="state.name"
            class="w-full"
            data-test="module-name"
          />
        </UFormField>

        <UFormField
          label="What it covers"
          name="description"
          hint="Optional"
          description="Shown to members in the catalogue, so write it for somebody deciding whether to take it."
        >
          <UTextarea
            v-model="state.description"
            :rows="3"
            class="w-full"
            data-test="module-description"
          />
        </UFormField>

        <UFormField
          label="Department"
          name="department"
          required
        >
          <USelectMenu
            v-model="state.department"
            :items="departmentOptions"
            value-key="value"
            placeholder="Choose a department"
            class="w-full"
            data-test="module-department"
          />
        </UFormField>

        <UFormField
          label="Kind"
          name="kind"
          required
          description="A brief is taught once: it carries no expiry, grants no standing and cannot be a prerequisite."
        >
          <USelectMenu
            v-model="state.kind"
            :items="kindOptions"
            value-key="value"
            :disabled="frozen"
            class="w-full"
            data-test="module-kind"
          />
          <p
            v-if="frozen"
            class="mt-2 text-sm text-muted"
            data-test="module-frozen"
          >
            Records exist against this module, so its kind and the standing it grants are fixed.
            Retire it and create a successor to mean something else.
          </p>
        </UFormField>

        <UFormField
          label="How it is delivered"
          name="deliveryMode"
          required
          :description="state.safetyCritical
            ? 'A safety-critical module can never be fully self-directed: online content may gate the in-person assessment, never replace it.'
            : undefined"
        >
          <USelectMenu
            v-model="state.deliveryMode"
            :items="modeOptions"
            value-key="value"
            class="w-full"
            data-test="module-mode"
          />
        </UFormField>

        <UFormField
          v-if="state.kind !== 'BRIEF'"
          label="How long it is worth"
          name="expiryMode"
          required
          description="Stamped on a record the day it is earned and never recomputed by a later change to this."
        >
          <USelectMenu
            v-model="state.expiryMode"
            :items="expiryOptions"
            value-key="value"
            class="w-full"
            data-test="module-expiry"
          />
        </UFormField>

        <UFormField
          v-if="state.kind !== 'BRIEF' && state.expiryMode === 'MONTHS'"
          label="Months from award"
          name="expiryMonths"
          required
          :description="`At most ${MAX_EXPIRY_MONTHS}.`"
        >
          <UInputNumber
            v-model="state.expiryMonths"
            :min="1"
            :max="MAX_EXPIRY_MONTHS"
            class="w-full"
            data-test="module-months"
          />
        </UFormField>

        <UFormField
          label="Status"
          name="status"
          required
          description="A draft is invisible to members. Retiring one blocks new sessions and sign-offs and leaves existing records readable."
        >
          <USelectMenu
            v-model="state.status"
            :items="lifecycleOptions"
            value-key="value"
            class="w-full"
            data-test="module-status"
          />
        </UFormField>

        <div class="space-y-3">
          <USwitch
            v-model="state.safetyCritical"
            label="Safety critical"
            data-test="module-safety-critical"
          />
          <USwitch
            v-model="state.signoffRequired"
            label="Awarded by sign-off rather than by a register"
          />
          <USwitch
            v-if="confersStanding"
            v-model="state.grantsTrainer"
            :disabled="frozen"
            label="Holding it makes somebody a trainer"
            description="Standing is derived from a current record on this module, never granted as a role."
            data-test="module-grants-trainer"
          />
          <USwitch
            v-if="confersStanding"
            v-model="state.grantsSupervisor"
            :disabled="frozen"
            label="Holding it makes somebody a supervisor"
          />
          <USwitch
            v-if="state.kind !== 'BRIEF'"
            v-model="state.allowsExternal"
            label="An external certificate can satisfy it"
            data-test="module-allows-external"
          />
          <USwitch
            v-if="state.kind === 'BRIEF'"
            v-model="state.selfRegistrable"
            label="People can register themselves for it"
          />
        </div>

        <UFormField
          v-if="state.kind !== 'BRIEF' && state.allowsExternal"
          label="Evidence we accept"
          name="externalEvidence"
          hint="Optional"
          description="Named on the screen that records one, so whoever is holding a certificate knows whether it counts."
        >
          <UInput
            v-model="state.externalEvidence"
            placeholder="A current first aid at work certificate"
            class="w-full"
            data-test="module-external-evidence"
          />
        </UFormField>

        <UFormField
          label="Where it sits in the list"
          name="sort"
          description="Lower comes first. Modules sharing a number fall back to their published id."
        >
          <UInputNumber
            v-model="state.sort"
            :min="0"
            :max="9999"
            class="w-full"
            data-test="module-sort"
          />
        </UFormField>

        <UFormField
          v-if="module"
          label="Needs first"
          description="Direct edges only. A brief can never be required, and a loop is refused by naming it."
        >
          <PrerequisiteEditor
            :module-id="module.id"
            :prerequisites="module.prerequisites"
            :candidates="candidates"
            @changed="emit('saved')"
            @failed="message => failure = message"
          />
        </UFormField>

        <UFormField
          label="Notes for leads"
          name="notes"
          hint="Optional"
          description="Not shown to members."
        >
          <UTextarea
            v-model="state.notes"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Material links">
          <div class="space-y-2">
            <div
              v-for="(material, index) in state.materials"
              :key="index"
              class="flex flex-wrap items-center gap-2"
            >
              <UInput
                v-model="material.label"
                placeholder="What it is"
                :data-test="`material-label-${index}`"
              />
              <UInput
                v-model="material.url"
                placeholder="https://"
                class="flex-1"
                :data-test="`material-url-${index}`"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="`Remove material link ${index + 1}`"
                @click="state.materials.splice(index, 1)"
              />
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              data-test="add-material"
              @click="addMaterial"
            >
              Add a link
            </UButton>
          </div>
        </UFormField>

        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            :loading="saving"
            data-test="module-submit"
          >
            {{ module ? 'Save it' : 'Add it' }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            data-test="module-cancel"
            @click="emit('update:open', false)"
          >
            Back
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
