/**
 * The front-of-house side of backstage: tonight's code, who has joined with
 * it, and the kill switch. The board itself is the backstage page (docs/11 §2.4).
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['foh'],
  title: 'Backstage',
})

interface Device { id: string, deviceName: string | null, joinedAt: string, lastSeenAt: string }
interface BackstageView {
  night: string
  code: string
  joinUrl: string
  joinQr: string
  expiresAt: string
  devices: Device[]
}

const requestFetch = useRequestFetch()
const { data, refresh } = await useAsyncData('foh-backstage', () => requestFetch<BackstageView>('/api/foh/backstage'))

const resetting = ref(false)
const confirming = ref(false)
const toast = useToast()

/** Grouped, because it gets read aloud over a headset. */
const grouped = computed(() => {
  const code = data.value?.code ?? ''
  return code ? `${code.slice(0, 3)} ${code.slice(3)}` : ''
})

async function reset() {
  resetting.value = true
  try {
    await requestFetch('/api/foh/backstage/reset', { method: 'POST' })
    await refresh()
    confirming.value = false
    toast.add({ title: 'Code reset. Every device is out.', color: 'success' })
  }
  catch {
    toast.add({ title: 'That did not reset', color: 'error' })
  }
  finally {
    resetting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Backstage
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <template v-if="data">
        <section class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-center">
          <p class="text-xs uppercase tracking-widest text-neutral-400">
            Tonight's code
          </p>
          <p class="my-3 font-mono text-5xl font-bold tracking-widest">
            {{ grouped }}
          </p>
          <img
            :src="data.joinQr"
            alt=""
            width="180"
            height="180"
            class="mx-auto rounded-lg bg-white p-2"
          >
          <p class="mt-3 text-sm text-neutral-400">
            Give this to the stage manager at the half. Do not write it anywhere that leaves the
            building: it changes tomorrow.
          </p>
        </section>

        <section class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
            Joined devices ({{ data.devices.length }})
          </h2>
          <!-- Counting these against the room is the control that makes a
               shared code honest (ADR-0020). -->
          <p class="mb-3 text-sm text-neutral-400">
            Count these against the devices you can actually see. A number you cannot account for is
            what the reset below is for.
          </p>
          <ul
            v-if="data.devices.length"
            class="divide-y divide-neutral-800"
          >
            <li
              v-for="device in data.devices"
              :key="device.id"
              class="flex justify-between py-2 text-sm"
            >
              <span>{{ device.deviceName ?? 'Unnamed device' }}</span>
              <span class="text-neutral-400">
                joined {{ formatTime(device.joinedAt) }} · seen {{ formatTime(device.lastSeenAt) }}
              </span>
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-neutral-400"
          >
            Nobody has joined yet.
          </p>
        </section>

        <section class="rounded-xl border border-red-900 bg-red-950/30 p-4">
          <h2 class="text-sm font-medium">
            Reset the code
          </h2>
          <p class="mt-1 text-sm text-neutral-300">
            Every joined device is signed out immediately and a new code appears. Use it if a device
            is lost, a message looks wrong, or the count above is off. It is logged and emailed, so
            use it freely.
          </p>
          <div
            v-if="confirming"
            class="mt-3 flex gap-2"
          >
            <UButton
              color="error"
              :loading="resetting"
              label="Yes, reset it"
              @click="reset"
            />
            <UButton
              variant="ghost"
              label="Cancel"
              @click="confirming = false"
            />
          </div>
          <UButton
            v-else
            class="mt-3"
            color="error"
            variant="subtle"
            label="Reset code"
            @click="confirming = true"
          />
        </section>
      </template>
    </div>
  </div>
</template>
