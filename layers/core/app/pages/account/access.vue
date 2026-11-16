<!-- The access scheme in My account (ID-38, ID-44; identity spec part 6). Before applying: what the
     scheme is and an "Apply" button. The form: ticks with optional notes, companions, who will read
     it. Afterwards: the application's state in plain words, the reviewer's message, change or leave,
     switches for other uses, and every read by staff. With the scheme off it is a missing page. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../components/AccessApplicationFields.vue'
import type { RefusalView } from '../../composables/useRefusal'

interface Mine {
  enabled: boolean
  name?: string
  allowNote?: boolean
  needs?: { id: string, key: string, label: string }[]
  application?: {
    status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
    inForce: AccessApplicationValue | null
    pending: AccessApplicationValue | null
    message: string | null
    verified: boolean
    companions: number
    submittedVia: 'self' | 'staff'
    submittedAt: number
    decidedAt: number | null
    reviewDue: number | null
  } | null
  sharing?: { id: string, label: string, explanation: string, on: boolean, fixed: boolean }[]
  reads?: { at: number, capacity: string | null, purpose: string | null }[]
}

const { t } = useT()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const route = useRoute()

const { data, refresh } = await useFetch<Mine>('/api/core/me/access', { key: 'core:my-access' })
if (!data.value?.enabled) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const name = computed(() => data.value?.name ?? '')
const application = computed(() => data.value?.application ?? null)
const labelOf = (id: string) => data.value?.needs?.find(n => n.id === id)?.label ?? t('core.access.retired-need')
const day = (ms: number) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(ms)

const editing = ref(route.query.apply !== undefined && !application.value)
const draft = ref<AccessApplicationValue>({ needs: [], companions: 0 })
const refusal = ref<RefusalView | null>(null)
const busy = ref(false)

function startEditing() {
  const from = application.value?.pending ?? application.value?.inForce
  draft.value = from ? structuredClone(toRaw(from)) : { needs: [], companions: 0 }
  refusal.value = null
  editing.value = true
}

async function send() {
  busy.value = true
  refusal.value = null
  try {
    await $fetch('/api/core/me/access', { method: 'POST', body: draft.value })
    editing.value = false
    toast.add({ title: t('core.access.sent'), color: 'success' })
    await refresh()
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  finally {
    busy.value = false
  }
}

async function leave() {
  const ok = await confirm({
    verb: t('core.access.leave.verb'),
    thing: t('core.access.leave.thing', { scheme: name.value }),
    consequence: t('core.access.leave.consequence'),
    button: t('core.access.leave.button'),
  })
  if (!ok) return
  try {
    await $fetch('/api/core/me/access', { method: 'DELETE', body: {} })
    toast.add({ title: t('core.access.left', { scheme: name.value }), color: 'success' })
    await refresh()
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}

async function confirmStillRight() {
  try {
    await $fetch('/api/core/me/access/confirm', { method: 'POST', body: {} })
    toast.add({ title: t('core.access.confirmed'), color: 'success' })
    await refresh()
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
}

async function share(purpose: string, on: boolean) {
  try {
    await $fetch('/api/core/me/access/sharing', { method: 'PUT', body: { purpose, on } })
  }
  catch (error) {
    refusal.value = toRefusal(error)
  }
  await refresh()
}

const STATUS = {
  'submitted': { tone: 'info', key: 'core.access.status.submitted' },
  'more-info': { tone: 'warning', key: 'core.access.status.more-info' },
  'accepted': { tone: 'success', key: 'core.access.status.accepted' },
  'rejected': { tone: 'danger', key: 'core.access.status.rejected' },
} as const

const purposeLabel = (read: { capacity: string | null, purpose: string | null }) =>
  read.purpose
    ? (data.value?.sharing?.find(p => p.id === read.purpose)?.label ?? read.purpose)
    : t('core.access.reads.reviewer')
</script>

<template>
  <PageFrame
    :title="name"
    width="reading"
  >
    <RefusalNotice :refusal="refusal" />

    <!-- The form, for a first application, an answer to a question, or a change. -->
    <form
      v-if="editing"
      class="space-y-6"
      @submit.prevent="send"
    >
      <AccessApplicationFields
        v-model="draft"
        :needs="data?.needs ?? []"
        :allow-note="!!data?.allowNote"
        :errors="refusal?.fields"
      />
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-eye"
        :title="t('core.access.form.who-reads')"
        :description="t('core.access.form.who-reads-detail')"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          type="submit"
          :loading="busy"
          :label="application ? t('core.access.form.send-change') : t('core.access.form.send')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('core.form.cancel')"
          @click="editing = false"
        />
      </div>
    </form>

    <!-- Before applying. -->
    <div
      v-else-if="!application"
      class="space-y-4"
    >
      <p>{{ t('core.access.intro', { scheme: name }) }}</p>
      <p class="text-muted">
        {{ t('core.access.intro-detail') }}
      </p>
      <UButton
        icon="i-lucide-file-pen-line"
        :label="t('core.access.apply')"
        @click="startEditing"
      />
    </div>

    <!-- Afterwards. -->
    <div
      v-else
      class="space-y-8"
    >
      <section
        aria-labelledby="access-state"
        class="space-y-3"
      >
        <h2
          id="access-state"
          class="text-lg font-semibold text-highlighted"
        >
          {{ t('core.access.state') }}
        </h2>
        <StatusBadge
          :tone="STATUS[application.status].tone"
          :label="t(STATUS[application.status].key)"
        />
        <p>{{ t(`${STATUS[application.status].key}.detail`, { scheme: name }) }}</p>
        <p
          v-if="application.submittedVia === 'staff'"
          class="text-sm text-muted"
        >
          {{ t('core.access.made-by-staff') }}
        </p>
        <UAlert
          v-if="application.message"
          color="neutral"
          variant="outline"
          icon="i-lucide-message-square"
          :title="t('core.access.message')"
          :description="application.message"
        />
        <p
          v-if="application.status === 'accepted' && application.pending"
          class="text-sm"
        >
          {{ t('core.access.change-waiting') }}
        </p>
      </section>

      <section
        v-if="application.inForce || application.pending"
        aria-labelledby="access-what"
        class="space-y-3"
      >
        <h2
          id="access-what"
          class="text-lg font-semibold text-highlighted"
        >
          {{ application.inForce ? t('core.access.in-force') : t('core.access.asked') }}
        </h2>
        <ul class="list-disc space-y-1 ps-5">
          <li
            v-for="need in (application.inForce ?? application.pending)!.needs"
            :key="need.term"
          >
            {{ labelOf(need.term) }}<span
              v-if="need.note"
              class="text-muted"
            > ({{ need.note }})</span>
          </li>
        </ul>
        <p>{{ t('core.access.companions', { count: (application.inForce ?? application.pending)!.companions }) }}</p>
        <p
          v-if="application.status === 'accepted'"
          class="text-sm text-muted"
        >
          {{ application.verified ? t('core.access.verified') : t('core.access.not-verified') }}
        </p>
      </section>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="application.status !== 'rejected'"
          icon="i-lucide-pencil"
          :label="application.status === 'more-info' ? t('core.access.answer') : t('core.access.change')"
          @click="startEditing"
        />
        <UButton
          v-else
          icon="i-lucide-file-pen-line"
          :label="t('core.access.apply-again')"
          @click="startEditing"
        />
        <UButton
          v-if="application.status === 'accepted'"
          color="neutral"
          variant="outline"
          icon="i-lucide-check"
          :label="t('core.access.still-right')"
          @click="confirmStillRight"
        />
        <UButton
          color="error"
          variant="ghost"
          icon="i-lucide-log-out"
          :label="t('core.access.leave.button')"
          @click="leave"
        />
      </div>
      <p
        v-if="application.status === 'accepted' && application.reviewDue"
        class="text-sm text-muted"
      >
        {{ t('core.access.review-due', { date: day(application.reviewDue) }) }}
      </p>
    </div>

    <section
      v-if="data?.sharing?.length"
      aria-labelledby="access-sharing"
      class="mt-10 space-y-4"
    >
      <h2
        id="access-sharing"
        class="text-lg font-semibold text-highlighted"
      >
        {{ t('core.access.sharing') }}
      </h2>
      <p class="text-sm text-muted">
        {{ t('core.access.sharing-help') }}
      </p>
      <USwitch
        v-for="purpose in data.sharing"
        :key="purpose.id"
        :model-value="purpose.on"
        :label="purpose.label"
        :description="purpose.explanation"
        :disabled="purpose.fixed && !!application"
        @update:model-value="share(purpose.id, $event)"
      />
    </section>

    <section
      v-if="application"
      aria-labelledby="access-reads"
      class="mt-10 space-y-3"
    >
      <h2
        id="access-reads"
        class="text-lg font-semibold text-highlighted"
      >
        {{ t('core.access.reads.title') }}
      </h2>
      <p
        v-if="!data?.reads?.length"
        class="text-sm text-muted"
      >
        {{ t('core.access.reads.none') }}
      </p>
      <ul
        v-else
        class="space-y-1 text-sm"
      >
        <li
          v-for="(read, i) in data.reads"
          :key="i"
        >
          {{ t('core.access.reads.line', { date: day(read.at), by: purposeLabel(read) }) }}
        </li>
      </ul>
    </section>
  </PageFrame>
</template>
