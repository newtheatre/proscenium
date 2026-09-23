<script setup lang="ts">
import { endOfLondonDay } from '#shared/utils/london'
import { londonDay } from '#shared/utils/membership'
import { ROLES, saysRole } from '#shared/utils/roles'
import type { Role } from '#shared/utils/roles'

// One grant form for both doors into A-118: the register, which fixes the role and picks the
// person, and the account page, which fixes the person and picks the role.

const props = withDefaults(defineProps<{
  // Given by the register, where the role is whichever tile is open.
  role?: Role
  // Given by the account page, where the grant is always about the account on screen.
  userId?: string
  // Roles already held live, which are not offered again: the server would renew them silently.
  held?: readonly string[]
}>(), { held: () => [] })

const emit = defineEmits<{ granted: [] }>()

const UNTIL = [
  { value: 'year', label: 'The committee year end' },
  { value: 'date', label: 'A date I pick' },
  { value: 'never', label: 'Further notice' },
] as const

type Until = (typeof UNTIL)[number]['value']

const chosenRole = ref<Role | undefined>(props.role)
const chosenPerson = ref<string | undefined>(props.userId)
const until = ref<Until>('year')
const day = ref<string | undefined>(undefined)
const note = ref('')
const working = ref(false)
const failure = ref<string | null>(null)

// The address is only ever the fallback once the picker has found nobody (A-132, K-123 criterion 1).
const nobody = ref<string | null>(null)
const byAddress = ref(false)
const address = ref('')
const name = ref('')

function grantByAddress(): void {
  address.value = nobody.value?.includes('@') ? nobody.value : ''
  byAddress.value = true
}

// The picker comes back empty-handed, so a stale "nobody" would offer the address just used.
function searchAgain(): void {
  nobody.value = null
  byAddress.value = false
  address.value = ''
  name.value = ''
}

watch(() => props.role, (role) => {
  chosenRole.value = role
})

const offered = computed(() => ROLES
  .filter(role => !props.held.includes(role))
  .map(role => ({ label: saysRole(role), value: role })))

const someone = computed(() => byAddress.value ? Boolean(address.value.trim() && name.value.trim()) : Boolean(chosenPerson.value))
const ready = computed(() => Boolean(chosenRole.value && someone.value && (until.value !== 'date' || day.value)))

// Omitted is the committee year end, null is permanent, and a picked day expires at its last
// instant in London, never at midnight UTC (0009, 0014).
function expiry(): { expiresAt?: number | null } {
  if (until.value === 'year') return {}
  if (until.value === 'never') return { expiresAt: null }
  return { expiresAt: Math.floor(endOfLondonDay(day.value!).getTime() / 1000) }
}

async function grant(): Promise<void> {
  if (!ready.value) return
  working.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/roles', {
      method: 'POST',
      body: {
        ...(byAddress.value ? { email: address.value.trim(), name: name.value.trim() } : { userId: chosenPerson.value }),
        role: chosenRole.value,
        ...expiry(),
        ...(note.value.trim() ? { note: note.value.trim() } : {}),
      },
    })
    if (!props.userId) chosenPerson.value = undefined
    searchAgain()
    if (!props.role) chosenRole.value = undefined
    until.value = 'year'
    day.value = undefined
    note.value = ''
    emit('granted')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <form
    class="space-y-3"
    data-test="grant-form"
    @submit.prevent="grant"
  >
    <UAlert
      v-if="failure"
      data-test="grant-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField
        v-if="!props.userId && !byAddress"
        label="Who"
      >
        <PersonPicker
          v-model="chosenPerson"
          data-test="grant-person"
          placeholder="Search by name, address or student number"
          @nobody="term => nobody = term"
        />
        <UButton
          v-if="nobody"
          class="mt-1 p-0"
          variant="link"
          size="sm"
          data-test="grant-nobody-found"
          @click="grantByAddress"
        >
          Nobody found? Grant it by address before their first sign-in
        </UButton>
      </UFormField>

      <div
        v-if="byAddress"
        class="space-y-3 sm:col-span-2"
        data-test="grant-by-email"
      >
        <p class="text-sm text-muted">
          The role waits for them: it takes effect when this address first signs in. A theatre
          address signs in with Google; any other address is sent a link to set a password.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Address">
            <UInput
              v-model="address"
              type="email"
              class="w-full"
              data-test="grant-email"
            />
          </UFormField>
          <UFormField label="Name">
            <UInput
              v-model="name"
              class="w-full"
              data-test="grant-name"
            />
          </UFormField>
        </div>
        <UButton
          variant="link"
          size="sm"
          class="p-0"
          data-test="grant-search-again"
          @click="searchAgain"
        >
          Search again
        </UButton>
      </div>

      <UFormField
        v-if="!props.role"
        label="Role"
      >
        <USelect
          v-model="chosenRole"
          :items="offered"
          value-key="value"
          placeholder="Choose a role"
          class="w-full"
          data-test="grant-role"
        />
      </UFormField>

      <UFormField label="Until">
        <USelect
          v-model="until"
          :items="[...UNTIL]"
          value-key="value"
          class="w-full"
          data-test="grant-until"
        />
      </UFormField>

      <UFormField
        v-if="until === 'date'"
        label="Expires at the end of"
      >
        <DateField
          v-model="day"
          :min="londonDay(new Date())"
          data-test="grant-date"
        />
      </UFormField>
    </div>

    <UFormField
      label="Note"
      description="Why this grant exists, for whoever reads the register next. Optional, 500 characters."
    >
      <UTextarea
        v-model="note"
        :rows="2"
        :maxlength="500"
        class="w-full"
        data-test="grant-note"
      />
    </UFormField>

    <UButton
      type="submit"
      :loading="working"
      :disabled="!ready"
      data-test="grant-submit"
    >
      Grant it
    </UButton>
  </form>
</template>
