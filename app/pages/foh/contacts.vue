/**
 * Who is on tonight, the numbers to call, and the incident log. Entries are
 * append-only: a correction is a new entry (docs/11 §2.6).
 */
<script setup lang="ts">
definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Contacts & incidents',
})

interface Contact { id: string, label: string, phone: string, kind: string, note: string | null }
interface OnTonight { role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', name: string }
interface Entry { id: string, body: string, supersedesId: string | null, createdAt: string, authorName: string }

const ROLE_LABELS: Record<OnTonight['role'], string> = {
  DUTY_MANAGER: 'Duty manager',
  DOOR: 'Door',
  BAR: 'Bar',
}

const { performance, performances } = await useFohTonight()
const requestFetch = useRequestFetch()

const { data: contactData, refresh: refreshContacts } = await useAsyncData(
  'foh-contacts',
  () => (performance.value
    ? requestFetch<{ onTonight: OnTonight[], contacts: Contact[] }>('/api/foh/contacts', {
        query: { performanceId: performance.value.id },
      })
    : Promise.resolve(null)),
  { watch: [performance] },
)

const { data: entryData, refresh: refreshEntries } = await useAsyncData(
  'foh-incidents',
  () => (performance.value
    ? requestFetch<Entry[]>('/api/foh/incidents', { query: { performanceId: performance.value.id } })
    : Promise.resolve(null)),
  { watch: [performance] },
)

const onTonight = computed<OnTonight[]>(() => contactData.value?.onTonight ?? [])
const contacts = computed<Contact[]>(() => contactData.value?.contacts ?? [])
const entries = computed<Entry[]>(() => entryData.value ?? [])

const draft = ref('')
const correcting = ref<Entry | null>(null)
const saving = ref(false)
const toast = useToast()

async function addEntry() {
  if (!performance.value || !draft.value.trim()) return
  saving.value = true
  try {
    await requestFetch('/api/foh/incidents', {
      method: 'POST',
      body: {
        performanceId: performance.value.id,
        body: draft.value.trim(),
        supersedesId: correcting.value?.id,
      },
    })
    draft.value = ''
    correcting.value = null
    await Promise.all([refreshEntries(), refreshContacts()])
  }
  catch {
    toast.add({ title: 'That entry was not saved', color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-5 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Contacts &amp; incidents
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <div
        v-if="!performance && performances.length > 1"
        class="space-y-2"
      >
        <p class="text-sm text-neutral-400">
          Which performance?
        </p>
        <NuxtLink
          v-for="option in performances"
          :key="option.id"
          :to="{ path: '/foh/contacts', query: { performance: option.id } }"
          class="block rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          {{ option.showTitle }} · {{ option.venueName }}
        </NuxtLink>
      </div>

      <template v-else-if="performance">
        <section
          v-if="onTonight.length"
          class="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
            On tonight
          </h2>
          <p
            v-for="(person, index) in onTonight"
            :key="index"
            class="flex justify-between py-1"
          >
            <span>{{ person.name }}</span>
            <span class="text-neutral-400">{{ ROLE_LABELS[person.role] }}</span>
          </p>
        </section>

        <section class="mb-6 space-y-2">
          <h2 class="text-xs uppercase tracking-widest text-neutral-400">
            Call
          </h2>
          <a
            v-for="contact in contacts"
            :key="contact.id"
            :href="`tel:${contact.phone.replace(/\s/g, '')}`"
            class="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <span>
              <span class="block font-medium">{{ contact.label }}</span>
              <span
                v-if="contact.note"
                class="block text-sm text-neutral-400"
              >{{ contact.note }}</span>
            </span>
            <span class="font-mono text-neutral-300">{{ contact.phone }}</span>
          </a>
          <p
            v-if="!contacts.length"
            class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
          >
            No numbers recorded yet.
          </p>
        </section>

        <section>
          <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-400">
            Incident log
          </h2>

          <div
            v-if="correcting"
            class="mb-2 rounded-lg bg-amber-950/60 p-3 text-sm text-amber-200"
          >
            Correcting an earlier entry. Both are kept.
            <button
              type="button"
              class="ml-2 underline"
              @click="correcting = null"
            >
              Cancel
            </button>
          </div>

          <form
            class="mb-4 space-y-2"
            @submit.prevent="addEntry"
          >
            <UTextarea
              v-model="draft"
              :rows="3"
              placeholder="What happened, and when. Names only if they matter."
              class="w-full"
            />
            <UButton
              type="submit"
              block
              size="lg"
              :loading="saving"
              label="Add to the log"
            />
          </form>

          <article
            v-for="entry in entries"
            :key="entry.id"
            class="mb-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
          >
            <p class="whitespace-pre-line">
              {{ entry.body }}
            </p>
            <p class="mt-2 text-xs text-neutral-400">
              {{ entry.authorName }} · {{ formatDateTime(entry.createdAt) }}
              <span v-if="entry.supersedesId"> · corrects an earlier entry</span>
            </p>
            <button
              type="button"
              class="mt-2 text-xs text-neutral-400 underline"
              @click="correcting = entry"
            >
              Correct this
            </button>
          </article>

          <p
            v-if="!entries.length"
            class="rounded-xl bg-neutral-900 p-4 text-sm text-neutral-400"
          >
            Nothing logged tonight.
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
