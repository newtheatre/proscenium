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

/** What the recorded list renders. The notes are not sent to it (ADR-0022). */
interface SettledProfile {
  userId: string
  name: string
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'DECLINED'
  difficultyStanding: boolean
  difficultyWithCrowds: boolean
  levelAccess: boolean
  distance: boolean
  urgentToilet: boolean
  visualInformation: boolean
  audibleInformation: boolean
  miscellaneous: boolean
  companions: number
  expiresAt: string | null
}

/** A profile still waiting, which is the only one carrying the free text. */
interface Profile extends SettledProfile {
  email: string
  accessCardNumber: string | null
  requesterNote: string | null
  fohNote: string | null
  consentFohAt: string | null
}

/** Same difficulty framing as the requester sees, so they read as one thing. */
const SYMBOLS = [
  { key: 'levelAccess', label: 'Stairs are a barrier' },
  { key: 'difficultyStanding', label: 'Standing or queueing' },
  { key: 'difficultyWithCrowds', label: 'Crowded spaces' },
  { key: 'distance', label: 'Walking distance' },
  { key: 'urgentToilet', label: 'May need to leave quickly' },
  { key: 'audibleInformation', label: 'Hard to hear announcements' },
  { key: 'visualInformation', label: 'Hard to read printed information' },
] as const

const { user } = useUserSession()
const allowed = computed(() => (user.value ? canVerifyAccess(user.value) : false))

const requestFetch = useRequestFetch()
const toast = useToast()

const PAGE_SIZE = 25
const waitingPage = ref(1)
const settledPage = ref(1)

const { data: waitingData, refresh, error } = await useAsyncData(
  'admin-access-waiting',
  () => requestFetch<Paginated<Profile>>('/api/admin/access', {
    query: { status: 'PENDING', page: waitingPage.value, limit: PAGE_SIZE },
  }),
  { watch: [waitingPage] },
)

// Fetched only when someone asks for it: a recorded profile is nobody's
// outstanding work, and it is still special category data (ADR-0022).
const { data: settledData, refresh: refreshSettled, status: settledStatus } = await useAsyncData(
  'admin-access-settled',
  () => requestFetch<Paginated<SettledProfile>>('/api/admin/access', {
    query: { status: 'SETTLED', page: settledPage.value, limit: PAGE_SIZE },
  }),
  { immediate: false, watch: [settledPage] },
)

/** Always an array: a null binding is the render-loop trap (ADR-0012). */
const waiting = computed<Profile[]>(() => waitingData.value?.rows ?? [])
const settled = computed<SettledProfile[]>(() => settledData.value?.rows ?? [])
const waitingTotal = computed(() => waitingData.value?.total ?? 0)
const settledTotal = computed(() => settledData.value?.total ?? 0)

const showSettled = ref(false)
const drafts = ref<Record<string, Record<string, unknown>>>({})

async function toggleSettled() {
  showSettled.value = !showSettled.value
  if (showSettled.value && settledStatus.value === 'idle') await refreshSettled()
}

watchEffect(() => {
  for (const profile of waiting.value) {
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
    if (settledStatus.value !== 'idle') await refreshSettled()
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
      v-if="!allowed"
      color="neutral"
      variant="subtle"
      title="You do not hold access verification"
      description="This is deliberately a one-or-two-people privilege, and is not part of box office access. The IT Manager grants it in the auth service."
    />

    <AdminFetchError
      v-else-if="error"
      :error="error"
      title="Could not load the verification queue"
      :on-retry="refresh"
    />

    <template v-else>
      <h2 class="text-sm font-medium">
        Waiting ({{ waitingTotal }})
      </h2>
      <UCard
        v-for="profile in waiting"
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
          <div
            v-if="profile.requesterNote"
            class="rounded-lg bg-elevated p-3"
          >
            <p class="text-xs uppercase tracking-widest text-muted">
              What they told us
            </p>
            <p class="mt-1 text-sm">
              {{ profile.requesterNote }}
            </p>
          </div>

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

      <UCard v-if="!waiting.length">
        <p class="text-sm text-muted">
          Nothing waiting.
        </p>
      </UCard>

      <UPagination
        v-if="waitingTotal > PAGE_SIZE"
        v-model:page="waitingPage"
        :items-per-page="PAGE_SIZE"
        :total="waitingTotal"
        class="flex justify-center"
      />

      <!-- Recorded profiles leave the queue, but stay reachable. -->
      <div class="pt-2">
        <UButton
          variant="ghost"
          size="sm"
          :loading="settledStatus === 'pending'"
          :label="showSettled ? `Hide recorded (${settledTotal})` : 'Show recorded'"
          @click="toggleSettled"
        />
        <ul
          v-if="showSettled && settled.length"
          class="mt-3 divide-y divide-default rounded-lg border border-default"
        >
          <li
            v-for="profile in settled"
            :key="profile.userId"
            class="flex items-center justify-between gap-3 p-3"
          >
            <div>
              <p class="text-sm font-medium">
                {{ profile.name }}
              </p>
              <p class="text-xs text-muted">
                {{ SYMBOLS.filter(sym => profile[sym.key]).map(sym => sym.label).join(', ') || 'No symbols' }}
                <template v-if="profile.companions">
                  · +{{ profile.companions }}
                </template>
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="profile.status === 'VERIFIED' ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ profile.status.toLowerCase() }}
              </UBadge>
              <span
                v-if="profile.expiresAt"
                class="text-xs text-muted"
              >
                until {{ formatDate(profile.expiresAt) }}
              </span>
            </div>
          </li>
        </ul>
        <p
          v-if="showSettled && settledStatus === 'success' && !settled.length"
          class="mt-3 text-sm text-muted"
        >
          Nothing recorded yet.
        </p>
        <UPagination
          v-if="showSettled && settledTotal > PAGE_SIZE"
          v-model:page="settledPage"
          :items-per-page="PAGE_SIZE"
          :total="settledTotal"
          class="mt-3 flex justify-center"
        />
      </div>
    </template>
  </div>
</template>
