<script setup lang="ts">
import { saysAudienceCount } from '#shared/utils/announcements'
import { NIGHT_AUDIENCES, NIGHT_AUDIENCE_LABELS, saysNightMessageSent } from '#shared/utils/night-message'
import type { NightAudience } from '#shared/utils/night-message'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/message-tonight-s-audience' })
useSeoMeta({ title: 'Message tonight\'s audience' })

interface House { id: string, showTitle: string, startsAt: number, active: boolean }

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<number | null>(null)
const failure = ref<string | null>(null)
// Refused outright: one card, and nothing left to send (issue 1304).
const refusal = ref<string | null>(null)

// Tonight's houses as the duty manager's own authority covers them, so no other house can be
// chosen here (0101, E-127); the hub hands over the one it was showing.
const houses = ref<House[]>([])
const handedOver = typeof route.query.performanceId === 'string' ? route.query.performanceId : null
const performanceId = ref<string | null>(null)
const choices = computed(() => houses.value.map(one => ({ performanceId: one.id, showTitle: one.showTitle, startsAt: one.startsAt })))

// Asked here rather than read from the shell's answer, so the houses are as of this visit (0078).
function readAuthority(): Promise<SettledRead<{ performances: House[] }>> {
  return settleRead(() => request<{ performances: House[] }>('/api/tonight/authority', { query: { role: 'DUTY_MANAGER' } }))
}

function chosenHouse(among: House[]): string | null {
  return handedOver ?? (among.find(one => one.active) ?? among[0])?.id ?? null
}

const audience = ref<NightAudience | null>('TICKET_HOLDERS')
const audienceOptions = NIGHT_AUDIENCES.map(value => ({ value, label: NIGHT_AUDIENCE_LABELS[value] }))
const count = ref<number | null>(null)
// Its own line, so a count that failed says so and clears on the next one; `failure` is authority's.
const countFailure = ref<string | null>(null)
// Which house and audience the count on screen answers, so the served count is not asked twice.
let countedFor: string | null = null

function readCount(house: string, whom: NightAudience): Promise<SettledRead<{ count: number }>> {
  return settleRead(() => request<{ count: number }>('/api/tonight/message/audience', { query: { performanceId: house, audience: whom } }))
}

function applyCount(answered: SettledRead<{ count: number }> | null, asked: string | null): void {
  countedFor = asked
  count.value = answered?.kind === 'READ' ? answered.value.count : null
  countFailure.value = answered?.kind === 'FAILED' ? answered.failure : null
}

// The count comes before the message (H-108 criterion 7), asked again whenever the house or the
// audience changes, never cached.
async function loadCount(): Promise<void> {
  const house = performanceId.value
  const whom = audience.value
  const asked = house && whom ? `${house}:${whom}` : null
  if (asked !== null && asked === countedFor) return
  applyCount(null, null)
  if (!house || !whom) return
  applyCount(await readCount(house, whom), asked)
}

// In the served page with the first count, so the form or the refusal is what a phone paints
// first; the count waits on the house authority names (issue 1521).
const waiting = useServedRead('tonight-message', async () => {
  const authority = await readAuthority()
  const house = authority.kind === 'READ' ? chosenHouse(authority.value.performances) : null
  const whom = audience.value
  const counted = house && whom ? { asked: `${house}:${whom}`, read: await readCount(house, whom) } : null
  return { authority, counted }
}, ({ authority, counted }) => {
  refusal.value = refusalOf(authority)
  if (authority.kind === 'FAILED') {
    if (!authority.refused) failure.value = authority.failure
    return
  }
  houses.value = authority.value.performances
  syncedAt.value = authority.at
  applyCount(counted?.read ?? null, counted?.asked ?? null)
  performanceId.value = chosenHouse(authority.value.performances)
})

watch([performanceId, audience], loadCount)

const subject = ref('')
const body = ref('')
const failureToSend = ref<string | null>(null)
const previewing = ref(false)
const sending = ref(false)
const preview = ref<{ count: number, rendered: { subject: string, text: string } } | null>(null)
const sent = ref<number | null>(null)
// One draft, one copy a person: Send pressed again after a dropped connection reaches only those
// not yet reached, and any change makes a new draft (0048).
const draftKey = ref(crypto.randomUUID())

const ready = computed(() => Boolean(performanceId.value && audience.value) && subject.value.trim().length > 0 && body.value.trim().length > 0)
const message = computed(() => ({ performanceId: performanceId.value, audience: audience.value, subject: subject.value, body: body.value, draftKey: draftKey.value }))

// A preview names this audience and these words or nothing: a stale one is worse than none, and a
// sent notice above words that did not go is worse still.
watch([performanceId, audience, subject, body], () => {
  preview.value = null
  sent.value = null
  draftKey.value = crypto.randomUUID()
})

async function runPreview(): Promise<void> {
  if (!ready.value) return
  previewing.value = true
  failureToSend.value = null
  try {
    preview.value = await $fetch('/api/tonight/message/preview', { method: 'POST', body: message.value })
  }
  catch (refused) {
    failureToSend.value = refusalText(refused)
  }
  finally {
    previewing.value = false
  }
}

async function send(): Promise<void> {
  if (!preview.value) return
  sending.value = true
  failureToSend.value = null
  try {
    const result = await $fetch<{ count: number }>('/api/tonight/message', { method: 'POST', body: message.value })
    sent.value = result.count
    preview.value = null
    toast.add({ title: saysNightMessageSent(result.count), icon: 'i-lucide-send', color: 'success' })
  }
  catch (refused) {
    failureToSend.value = writeFailureText(refused, 'Press Send again: nobody who already has it gets it twice.')
  }
  finally {
    sending.value = false
  }
}

function startAnother(): void {
  subject.value = ''
  body.value = ''
  sent.value = null
  draftKey.value = crypto.randomUUID()
}
</script>

<template>
  <NightScreen
    title="Message tonight's audience"
    :refused="refusal"
    hint="It goes at once to everyone you choose, whatever their preferences."
    :stale="syncedAt"
    :busy="waiting"
  >
    <!-- Nothing to write until authority has answered, since it may yet refuse this viewer. -->
    <div
      v-if="!waiting"
      class="space-y-4"
      data-test="night-message"
    >
      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        :description="failure"
        data-test="night-message-failure"
      />

      <NightPerformanceSwitcher
        v-if="choices.length > 1"
        :performances="choices"
        :selected-id="performanceId"
        @choose="performanceId = $event"
      />

      <NightChoices
        v-model="audience"
        label="Who it goes to"
        :options="audienceOptions"
        test-id="night-message-audience"
      />
      <p
        class="-mt-2 text-sm text-muted"
        data-test="night-message-count"
      >
        {{ countFailure ?? (count === null ? 'Counting who that is' : saysAudienceCount(count)) }}
      </p>

      <UAlert
        v-if="sent !== null"
        color="success"
        variant="subtle"
        icon="i-lucide-send"
        :title="saysNightMessageSent(sent)"
        description="What went out is below, as it was sent."
        data-test="night-message-sent"
      >
        <template #actions>
          <UButton
            color="neutral"
            variant="outline"
            class="min-h-12"
            data-test="night-message-again"
            @click="startAnother"
          >
            Write another
          </UButton>
        </template>
      </UAlert>

      <UFormField label="Subject">
        <UInput
          v-model="subject"
          size="xl"
          class="w-full"
          data-test="night-message-subject"
        />
      </UFormField>

      <UFormField label="Message">
        <UTextarea
          v-model="body"
          :rows="5"
          class="w-full"
          data-test="night-message-body"
        />
      </UFormField>

      <UAlert
        v-if="failureToSend"
        color="error"
        variant="subtle"
        :description="failureToSend"
        data-test="night-message-send-failure"
      />

      <NightBlock
        v-if="preview"
        title="What they will get"
      >
        <div
          class="space-y-2"
          data-test="night-message-preview"
        >
          <p class="font-semibold">
            {{ preview.rendered.subject }}
          </p>
          <p class="whitespace-pre-line text-sm">
            {{ preview.rendered.text }}
          </p>
        </div>
      </NightBlock>
    </div>

    <template
      v-if="!waiting"
      #actions
    >
      <NightAction
        v-if="preview"
        :label="`Send to ${plural(preview.count, 'person', 'people')}`"
        icon="i-lucide-send"
        :loading="sending"
        data-test="night-message-send"
        @press="send"
      />
      <NightAction
        v-else
        label="Preview"
        icon="i-lucide-eye"
        color="neutral"
        variant="outline"
        :disabled="!ready"
        :loading="previewing"
        data-test="night-message-preview-open"
        @press="runPreview"
      />
    </template>
  </NightScreen>
</template>
