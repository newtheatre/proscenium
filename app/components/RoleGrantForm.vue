<script setup lang="ts">
import { endOfLondonDay } from '#shared/utils/london'
import { londonDay } from '#shared/utils/membership'
import { ROLES, defaultRoleExpiry, saysRole } from '#shared/utils/roles'
import { saysList } from '#shared/utils/text'
import { saysDayLong } from '#shared/utils/when'
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

type Until = 'year' | 'date' | 'never'

// The default names its date: a grant made in July otherwise ends within weeks unseen (issue 1355).
const UNTIL: { value: Until, label: string }[] = [
  { value: 'year', label: `The committee year end, ${saysDayLong(defaultRoleExpiry(new Date()), { year: true })}` },
  { value: 'date', label: 'A date I pick' },
  { value: 'never', label: 'Further notice' },
]

const chosenRole = ref<Role | undefined>(props.role)
// The account page fixes the person, so it grants several roles at once; the register one (0257).
const several = computed(() => !props.role && Boolean(props.userId))
const chosenRoles = ref<Role[]>([])
const chosenPerson = ref<string | undefined>(props.userId)
const until = ref<Until>('year')
const day = ref<string | undefined>(undefined)
const note = ref('')
const working = ref(false)
const failure = ref<string | null>(null)
// The roles just granted that do nothing until their holder sets up an authenticator (A-112).
const waitsOn = ref<Role[]>([])

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
// A typed day can sit before the picker's minimum, so it is said under the field rather than ignored (0157).
const dayProblem = computed(() => until.value === 'date' && day.value && day.value < londonDay(new Date()) ? 'Pick a date from today on' : undefined)
const roleChosen = computed(() => several.value ? chosenRoles.value.length > 0 : Boolean(chosenRole.value))
const ready = computed(() => Boolean(roleChosen.value && someone.value && (until.value !== 'date' || (day.value && !dayProblem.value))))

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
  waitsOn.value = []
  try {
    const granted = await $fetch<{ role: Role, waitsOnFactor: boolean, granted?: { role: Role, waitsOnFactor: boolean }[] }>('/api/admin/roles', {
      method: 'POST',
      body: {
        ...(byAddress.value ? { email: address.value.trim(), name: name.value.trim() } : { userId: chosenPerson.value }),
        ...(several.value ? { roles: chosenRoles.value } : { role: chosenRole.value }),
        ...expiry(),
        ...(note.value.trim() ? { note: note.value.trim() } : {}),
      },
    })
    waitsOn.value = (granted.granted ?? [granted]).filter(one => one.waitsOnFactor).map(one => one.role)
    if (!props.userId) chosenPerson.value = undefined
    searchAgain()
    if (!props.role) chosenRole.value = undefined
    chosenRoles.value = []
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

    <UAlert
      v-if="waitsOn.length"
      data-test="grant-waits-on-factor"
      color="warning"
      variant="subtle"
      icon="i-lucide-smartphone"
      :title="`Granted, but ${saysList(waitsOn.map(saysRole))} ${waitsOn.length === 1 ? 'needs' : 'need'} an authenticator app`"
      description="It does nothing for them until they set one up under Security in their account. Tell them now, before they meet a refused screen."
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
        v-if="several"
        label="Roles"
        description="One or more, granted together with the same expiry and note."
      >
        <USelect
          v-model="chosenRoles"
          :items="offered"
          value-key="value"
          multiple
          placeholder="Choose roles"
          class="w-full"
          data-test="grant-roles"
        />
      </UFormField>

      <UFormField
        v-else-if="!props.role"
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
          :items="UNTIL"
          value-key="value"
          class="w-full"
          data-test="grant-until"
        />
      </UFormField>

      <UFormField
        v-if="until === 'date'"
        label="Expires at the end of"
        :error="dayProblem"
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
      {{ several && chosenRoles.length > 1 ? `Grant ${chosenRoles.length} roles` : 'Grant it' }}
    </UButton>
  </form>
</template>
