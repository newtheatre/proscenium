/**
 * Challenge 25. Two counters and a refusal form: the ratio of accepted to
 * refused is the evidence the policy is operated (docs/13 §4.2).
 */
<script setup lang="ts">
definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Challenge 25',
})

interface Entry {
  id: string
  reason: string | null
  productDescription: string | null
  description: string | null
  notes: string | null
  supersedesId: string | null
  checkedAt: string
  checkedByName: string
}
interface Register { night: string, accepted: number, refused: number, entries: Entry[] }

const REASONS = [
  { value: 'NO_ID', label: 'No ID' },
  { value: 'ID_NOT_ACCEPTED', label: 'ID not accepted' },
  { value: 'UNDER_25_NO_ID', label: 'Looked under 25, no ID' },
  { value: 'INTOXICATED', label: 'Intoxicated' },
  { value: 'PROXY', label: 'Buying for someone else' },
  { value: 'OTHER', label: 'Other' },
] as const

const { performance } = await useFohTonight()
const requestFetch = useRequestFetch()
const toast = useToast()

// One page, two modes (docs/14 §8).
const route = useRoute()
const training = useTrainingMode()
// A refused start must never fall through to the live screen.
if (route.query.practice) await training.enter('challenge-25')
await training.refresh()
training.leaveWhenPracticeEnds()
const api = (path: string) => `${training.prefix.value}${path}`

const { data, refresh } = await useAsyncData('foh-age-checks',
  () => requestFetch<Register>(api('/api/foh/age-checks')),
  { watch: [training.active] })

const register = computed<Register>(() => data.value ?? { night: '', accepted: 0, refused: 0, entries: [] })

const busy = ref(false)
const showForm = ref(false)
const correcting = ref<Entry | null>(null)
type Reason = (typeof REASONS)[number]['value']
const form = reactive<{ reason: Reason, productDescription: string, description: string, notes: string }>({
  reason: 'UNDER_25_NO_ID',
  productDescription: '',
  description: '',
  notes: '',
})

async function record(outcome: 'ACCEPTED' | 'REFUSED') {
  busy.value = true
  try {
    await requestFetch(api('/api/foh/age-checks'), {
      method: 'POST',
      body: {
        outcome,
        performanceId: performance.value?.id,
        ...(outcome === 'REFUSED'
          ? {
              reason: form.reason,
              productDescription: form.productDescription || undefined,
              description: form.description || undefined,
              notes: form.notes || undefined,
              supersedesId: correcting.value?.id,
            }
          : {}),
      },
    })
    if (outcome === 'REFUSED') {
      form.productDescription = ''
      form.description = ''
      form.notes = ''
      showForm.value = false
      correcting.value = null
    }
    await refresh()
  }
  catch (error) {
    toast.add({
      title: 'That was not recorded',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

function reasonLabel(value: string | null) {
  return REASONS.find(r => r.value === value)?.label ?? value ?? ''
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Challenge 25
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <section class="mb-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          :disabled="busy"
          class="rounded-xl border-2 border-emerald-700 bg-emerald-950/40 p-5 text-center"
          @click="record('ACCEPTED')"
        >
          <span class="block text-4xl font-bold">{{ register.accepted }}</span>
          <span class="mt-1 block text-xs uppercase tracking-widest text-emerald-300">
            IDs accepted: tap to add
          </span>
        </button>
        <div class="rounded-xl border-2 border-amber-700 bg-amber-950/30 p-5 text-center">
          <span class="block text-4xl font-bold">{{ register.refused }}</span>
          <span class="mt-1 block text-xs uppercase tracking-widest text-amber-300">
            Refusals tonight
          </span>
        </div>
      </section>

      <UButton
        v-if="!showForm"
        block
        size="xl"
        color="warning"
        variant="subtle"
        label="Log a refusal"
        class="mb-5"
        @click="showForm = true"
      />

      <section
        v-else
        class="mb-5 space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
      >
        <p
          v-if="correcting"
          class="rounded-lg bg-amber-950/60 p-2 text-sm text-amber-200"
        >
          Correcting an earlier entry. Both are kept.
        </p>
        <UFormField label="Reason">
          <USelect
            v-model="form.reason"
            :items="REASONS.map(r => ({ label: r.label, value: r.value }))"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Asked for">
          <UInput
            v-model="form.productDescription"
            placeholder="e.g. a pint of cider"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Description"
          help="For the register, not a name. No photos, ever."
        >
          <UInput
            v-model="form.description"
            placeholder="e.g. tall, grey coat"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Notes">
          <UTextarea
            v-model="form.notes"
            :rows="2"
            class="w-full"
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton
            color="warning"
            :loading="busy"
            label="Log it"
            @click="record('REFUSED')"
          />
          <UButton
            variant="ghost"
            label="Cancel"
            @click="showForm = false; correcting = null"
          />
        </div>
      </section>

      <section>
        <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
          Tonight's refusals
        </h2>
        <article
          v-for="entry in register.entries"
          :key="entry.id"
          class="mb-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <p class="font-medium">
            {{ reasonLabel(entry.reason) }}
            <span
              v-if="entry.productDescription"
              class="font-normal text-neutral-400"
            >
              · {{ entry.productDescription }}
            </span>
          </p>
          <p
            v-if="entry.description"
            class="mt-1 text-sm text-neutral-300"
          >
            {{ entry.description }}
          </p>
          <p
            v-if="entry.notes"
            class="mt-1 text-sm text-neutral-400"
          >
            {{ entry.notes }}
          </p>
          <p class="mt-2 text-xs text-neutral-500">
            {{ formatTime(entry.checkedAt) }} · {{ entry.checkedByName }}
            <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
          </p>
          <button
            type="button"
            class="mt-2 text-xs text-neutral-400 underline"
            @click="correcting = entry; showForm = true"
          >
            Correct this
          </button>
        </article>
        <p
          v-if="!register.entries.length"
          class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
        >
          No refusals logged tonight.
        </p>
      </section>
    </div>
  </div>
</template>
