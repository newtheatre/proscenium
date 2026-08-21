/**
 * The backstage board's front door. No account: a device joins with tonight's
 * code, and emergency information is readable before it does (docs/11 §5.1).
 */
<script setup lang="ts">
definePageMeta({ layout: false, title: 'Backstage' })

interface EmergencyCard {
  venueName: string
  addressForEmergencyCall: string | null
  what3words: string | null
  evacuationProcedure: string | null
  assemblyPoint: string | null
  firstAidLocation: string | null
  defibrillatorLocation: string | null
  isolationPoints: string | null
  firePanelLocation: string | null
}

const route = useRoute()
const code = ref(typeof route.query.code === 'string' ? route.query.code : '')
const name = ref('')
const joining = ref(false)
const problem = ref<string | null>(null)
const joined = ref<{ night: string, deviceName: string | null } | null>(null)
const showEmergency = ref(false)

const { data: session } = await useAsyncData('backstage-session', () =>
  $fetch<{ night: string, deviceName: string | null }>('/api/backstage/session').catch(() => null))
if (session.value) joined.value = session.value

const { data: cards } = await useAsyncData('backstage-emergency', () =>
  $fetch<EmergencyCard[]>('/api/backstage/emergency').catch(() => []))

async function join() {
  if (code.value.replace(/\s/g, '').length < 6) return
  joining.value = true
  problem.value = null
  try {
    joined.value = await $fetch('/api/backstage/join', {
      method: 'POST',
      body: { code: code.value, name: name.value || undefined },
    })
  }
  catch (error) {
    problem.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage
      ?? 'That did not work. Ask the duty manager to read the code out again.'
  }
  finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-xl px-4 py-8">
      <header class="mb-6">
        <h1 class="text-2xl font-semibold">
          Backstage
        </h1>
        <p class="text-sm text-neutral-400">
          Nottingham New Theatre
        </p>
      </header>

      <section
        v-if="joined"
        class="mb-6 rounded-xl border border-emerald-700 bg-emerald-950/40 p-5"
      >
        <p class="text-lg font-medium">
          Joined for tonight.
        </p>
        <p class="mt-1 text-sm text-emerald-200">
          <template v-if="joined.deviceName">
            This device is <strong>{{ joined.deviceName }}</strong>.
          </template>
          <template v-else>
            This device joined without a name.
          </template>
          It stays joined until the night is closed, or 02:00.
        </p>
        <p class="mt-3 text-sm text-neutral-300">
          The board itself arrives in the next change. Until then, the emergency information below
          is available on this device.
        </p>
      </section>

      <section
        v-else
        class="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <p class="mb-4 text-sm text-neutral-400">
          Ask the duty manager for tonight's six-digit code. It changes every day.
        </p>
        <form
          class="space-y-3"
          @submit.prevent="join"
        >
          <UInput
            v-model="code"
            placeholder="000 000"
            inputmode="numeric"
            autocomplete="off"
            size="xl"
            class="w-full font-mono text-2xl tracking-widest"
          />
          <UInput
            v-model="name"
            placeholder="Your name and role (optional) — Sam, DSM"
            class="w-full"
          />
          <UButton
            type="submit"
            block
            size="xl"
            :loading="joining"
            label="Join"
          />
        </form>
        <p
          v-if="problem"
          class="mt-3 text-sm text-amber-400"
        >
          {{ problem }}
        </p>
      </section>

      <!-- Never behind the code: safety information is not a privilege (§5.1). -->
      <UButton
        block
        size="lg"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :label="showEmergency ? 'Hide emergency information' : 'Emergency information'"
        @click="showEmergency = !showEmergency"
      />

      <div
        v-if="showEmergency"
        class="mt-4 space-y-3"
      >
        <article
          v-for="card in cards ?? []"
          :key="card.venueName"
          class="rounded-xl border-2 border-red-700 bg-red-950/30 p-4"
        >
          <p class="text-xs uppercase tracking-widest text-red-300">
            {{ card.venueName }} — read this to 999
          </p>
          <p class="mt-1 text-xl font-bold leading-snug">
            {{ card.addressForEmergencyCall ?? card.venueName }}
          </p>
          <p
            v-if="card.what3words"
            class="mt-1 font-mono text-red-200"
          >
            ///{{ card.what3words.replace(/^\/+/, '') }}
          </p>
          <a
            href="tel:999"
            class="mt-3 block rounded-lg bg-red-600 py-3 text-center font-semibold text-white"
          >
            Call 999
          </a>
          <dl class="mt-4 space-y-2 text-sm">
            <div v-if="card.assemblyPoint">
              <dt class="text-neutral-400">
                Assembly point
              </dt>
              <dd>{{ card.assemblyPoint }}</dd>
            </div>
            <div v-if="card.evacuationProcedure">
              <dt class="text-neutral-400">
                Evacuation
              </dt>
              <dd class="whitespace-pre-line">
                {{ card.evacuationProcedure }}
              </dd>
            </div>
            <div v-if="card.firstAidLocation">
              <dt class="text-neutral-400">
                First aid
              </dt>
              <dd>{{ card.firstAidLocation }}</dd>
            </div>
            <div v-if="card.defibrillatorLocation">
              <dt class="text-neutral-400">
                Defibrillator
              </dt>
              <dd>{{ card.defibrillatorLocation }}</dd>
            </div>
          </dl>
        </article>
        <p
          v-if="!(cards ?? []).length"
          class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
        >
          No emergency details recorded for tonight's venues.
        </p>
      </div>
    </div>
  </div>
</template>
