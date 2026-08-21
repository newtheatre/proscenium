/**
 * Verify an access profile. Behind `access.verify` rather than staff access:
 * selling someone a ticket is not a reason to read their needs (ADR-0022).
 */
<script setup lang="ts">
import { canVerifyAccess } from '~~/shared/utils/abilities'

definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
  title: 'Access',
})

interface Profile {
  userId: string
  name: string
  email: string
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'DECLINED'
  accessCardNumber: string | null
  difficultyStanding: boolean
  difficultyWithCrowds: boolean
  levelAccess: boolean
  distance: boolean
  urgentToilet: boolean
  visualInformation: boolean
  audibleInformation: boolean
  miscellaneous: boolean
  companions: number
  fohNote: string | null
  consentFohAt: string | null
  expiresAt: string | null
}

const SYMBOLS = [
  { key: 'levelAccess', label: 'Level access' },
  { key: 'difficultyStanding', label: 'Difficulty standing' },
  { key: 'difficultyWithCrowds', label: 'Difficulty with crowds' },
  { key: 'distance', label: 'Distance' },
  { key: 'urgentToilet', label: 'Urgent toilet needs' },
  { key: 'visualInformation', label: 'Visual information' },
  { key: 'audibleInformation', label: 'Audible information' },
  { key: 'miscellaneous', label: 'Something else' },
] as const

const { user } = useUserSession()
const allowed = computed(() => (user.value ? canVerifyAccess(user.value) : false))

const requestFetch = useRequestFetch()
const toast = useToast()
const { data, refresh, error } = await useAsyncData('admin-access', () =>
  requestFetch<Profile[]>('/api/admin/access').catch(() => []))

const profiles = computed<Profile[]>(() => data.value ?? [])
const drafts = ref<Record<string, Record<string, unknown>>>({})

watchEffect(() => {
  for (const profile of profiles.value) {
    if (drafts.value[profile.userId]) continue
    drafts.value[profile.userId] = {
      ...Object.fromEntries(SYMBOLS.map(s => [s.key, profile[s.key]])),
      companions: profile.companions,
      fohNote: profile.fohNote ?? '',
    }
  }
})

const saving = ref<string | null>(null)

async function decide(profile: Profile, status: 'VERIFIED' | 'DECLINED') {
  saving.value = profile.userId
  try {
    await requestFetch(`/api/admin/access/${profile.userId}`, {
      method: 'PUT',
      body: { ...drafts.value[profile.userId], status, fohNote: (drafts.value[profile.userId]?.fohNote as string) || null },
    })
    await refresh()
    toast.add({ title: status === 'VERIFIED' ? 'Recorded, and they have been told' : 'Marked as not recorded', color: 'success' })
  }
  catch {
    toast.add({ title: 'That did not save', color: 'error' })
  }
  finally {
    saving.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Access
      </h1>
      <p class="text-sm text-muted">
        Look at whatever someone offers, and record only the conclusion. Nothing is attached, kept
        or forwarded: no cards, letters or photographs, ever.
      </p>
    </div>

    <UAlert
      v-if="!allowed || error"
      color="neutral"
      variant="subtle"
      title="You do not hold access verification"
      description="This is deliberately a one-or-two-people privilege, and is not part of box office access. The IT Manager grants it in the auth service."
    />

    <template v-else>
      <UCard
        v-for="profile in profiles"
        :key="profile.userId"
      >
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="font-medium">
                {{ profile.name }}
              </p>
              <p class="text-sm text-muted">
                {{ profile.email }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="profile.status === 'VERIFIED' ? 'success' : profile.status === 'PENDING' ? 'warning' : 'neutral'"
                variant="subtle"
              >
                {{ profile.status.toLowerCase() }}
              </UBadge>
              <UBadge
                v-if="!profile.consentFohAt"
                color="error"
                variant="subtle"
              >
                no consent
              </UBadge>
            </div>
          </div>
        </template>

        <div
          v-if="drafts[profile.userId]"
          class="space-y-4"
        >
          <p
            v-if="profile.accessCardNumber"
            class="text-sm"
          >
            <span class="text-muted">Access Card offered:</span>
            <span class="font-mono">{{ profile.accessCardNumber }}</span>
          </p>

          <div class="grid gap-2 sm:grid-cols-2">
            <UCheckbox
              v-for="symbol in SYMBOLS"
              :key="symbol.key"
              v-model="drafts[profile.userId]![symbol.key] as boolean"
              :label="symbol.label"
            />
          </div>

          <UFormField label="Essential companions">
            <USelect
              v-model="drafts[profile.userId]!.companions as number"
              :items="[{ label: 'None', value: 0 }, { label: '+1', value: 1 }, { label: '+2', value: 2 }]"
            />
          </UFormField>

          <UFormField
            label="Note for the team on the night"
            help="Agree the wording with them. They can see it, and it goes in the email confirming what was recorded."
          >
            <UTextarea
              v-model="drafts[profile.userId]!.fohNote as string"
              :rows="2"
              placeholder="e.g. transfers from chair to aisle seat; chair stored at the kiosk"
              class="w-full"
            />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              :loading="saving === profile.userId"
              label="Record and confirm"
              @click="decide(profile, 'VERIFIED')"
            />
            <UButton
              variant="ghost"
              color="error"
              label="Not recorded"
              @click="decide(profile, 'DECLINED')"
            />
            <p
              v-if="profile.expiresAt"
              class="ml-auto text-sm text-muted"
            >
              Until {{ formatDate(profile.expiresAt) }}
            </p>
          </div>
        </template>
      </UCard>

      <UCard v-if="!profiles.length">
        <p class="text-sm text-muted">
          Nothing waiting.
        </p>
      </UCard>
    </template>
  </div>
</template>
