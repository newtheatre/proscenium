<!-- The practice panel (PM-S4, PM-13, PM-14, PM-15): opened from the banner. The scenario's tasks as
     square boxes that tick themselves once their change commits (T1), the scheduled tasks the trainee
     may run now (O4), the emails the session would have sent (O3), and Start again and Leave. -->
<script setup lang="ts">
import type { PracticePanelData } from '../composables/usePractice'

const props = defineProps<{ panel: PracticePanelData }>()
const open = defineModel<boolean>('open', { required: true })

const { t, te } = useT()
const { time } = useDates()
const { $api } = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()
const { leave, start } = usePracticeActions()
const label = (key: string) => (te(key) ? t(key) : key)
const allDone = computed(() => props.panel.tasks.length > 0 && props.panel.tasks.every(task => task.passedAt !== null))
const email = ref<string | null>(null)
const running = ref<string | null>(null)
const busy = ref(false)

async function runNow(task: string) {
  running.value = task
  try {
    await $api('/api/core/practice/run', { method: 'POST', body: { task } })
    toast.add({ title: t('core.practice.panel.ran', { task: label(task) }), color: 'success' })
  }
  finally {
    running.value = null
  }
}

async function again() {
  const ok = await confirm({
    verb: t('core.practice.panel.again'),
    thing: t(props.panel.scenario.label),
    consequence: t('core.practice.panel.again-consequence'),
    button: t('core.practice.panel.again'),
  })
  if (!ok) return
  busy.value = true
  try {
    await start(props.panel.scenario.id, { again: true })
    open.value = false
  }
  finally {
    busy.value = false
  }
}

async function leaveNow() {
  busy.value = true
  try {
    await leave()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t(panel.scenario.label)"
    :description="t('core.practice.panel.started', { time: time(panel.startedAt) })"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <UAlert
          v-if="panel.scenario.newer"
          color="info"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          :title="t('core.practice.panel.newer')"
        />
        <section
          v-if="panel.tasks.length"
          aria-labelledby="practice-tasks"
          class="flex flex-col gap-3"
        >
          <h2
            id="practice-tasks"
            class="font-semibold text-highlighted"
          >
            {{ t('core.practice.panel.tasks') }}
          </h2>
          <ul class="flex flex-col gap-2">
            <li
              v-for="task in panel.tasks"
              :key="task.id"
              class="flex items-center gap-3"
            >
              <UIcon
                :name="task.passedAt ? 'i-lucide-square-check' : 'i-lucide-square'"
                :class="task.passedAt ? 'text-success' : 'text-muted'"
                class="size-6 shrink-0"
              />
              <span>{{ label(task.label) }}</span>
              <span class="sr-only">{{ task.passedAt ? t('core.practice.panel.done') : t('core.practice.panel.not-done') }}</span>
            </li>
          </ul>
          <UAlert
            v-if="allDone"
            color="success"
            variant="subtle"
            icon="i-lucide-party-popper"
            :title="t('core.practice.panel.all-done')"
          />
        </section>
        <section
          v-if="panel.scenario.runnable.length"
          aria-labelledby="practice-run"
          class="flex flex-col gap-3"
        >
          <h2
            id="practice-run"
            class="font-semibold text-highlighted"
          >
            {{ t('core.practice.panel.run-title') }}
          </h2>
          <p class="text-sm text-muted">
            {{ t('core.practice.panel.run-help') }}
          </p>
          <ul class="flex flex-col gap-2">
            <li
              v-for="task in panel.scenario.runnable"
              :key="task"
              class="flex items-center justify-between gap-3"
            >
              <span>{{ label(task) }}</span>
              <UButton
                color="neutral"
                variant="outline"
                size="xl"
                icon="i-lucide-play"
                :loading="running === task"
                :label="t('core.practice.panel.run')"
                @click="runNow(task)"
              />
            </li>
          </ul>
        </section>
        <section
          aria-labelledby="practice-outbox"
          class="flex flex-col gap-3"
        >
          <h2
            id="practice-outbox"
            class="font-semibold text-highlighted"
          >
            {{ t('core.practice.panel.outbox') }}
          </h2>
          <p
            v-if="!panel.outbox.length"
            class="text-sm text-muted"
          >
            {{ t('core.practice.panel.outbox-empty') }}
          </p>
          <RecordList
            v-else
            :label="t('core.practice.panel.outbox')"
          >
            <RecordListItem
              v-for="message in panel.outbox"
              :key="message.id"
              icon="i-lucide-mail"
              :name="message.subject ?? t('core.practice.panel.no-subject')"
              :description="t('core.practice.panel.to', { to: message.to, time: time(message.at) })"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xl"
                :label="t('core.practice.panel.read')"
                @click="email = message.id"
              />
            </RecordListItem>
          </RecordList>
        </section>
      </div>
      <PracticeEmail
        :id="email"
        @close="email = null"
      />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-between gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          icon="i-lucide-rotate-ccw"
          :disabled="busy"
          :label="t('core.practice.panel.again')"
          @click="again"
        />
        <UButton
          color="neutral"
          size="xl"
          icon="i-lucide-log-out"
          :loading="busy"
          :label="t('core.practice.leave')"
          @click="leaveNow"
        />
      </div>
    </template>
  </USlideover>
</template>
