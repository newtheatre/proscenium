<script setup lang="ts">
import { DECLINE_REASON_LIMIT } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Training requests', middleware: 'console' })

interface Demand {
  moduleId: string
  moduleName: string
  department: string
  waiting: number
  requesters: { id: string, userId: string, name: string, note: string | null }[]
}

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const answering = ref<{ id: string, name: string, moduleId: string } | null>(null)
const reason = ref('')
const saving = ref(false)

const { data, status, error, refresh } = await useAsyncData(
  'admin-training-requests',
  () => request<{ items: Demand[] }>('/api/admin/training/requests'),
  { default: () => ({ items: [] as Demand[] }) },
)

async function answer(): Promise<void> {
  if (!answering.value) return
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/training/requests/${answering.value.id}/decline`, {
      method: 'POST',
      body: { reason: reason.value },
    })
    toast.add({
      title: 'Answered',
      description: 'They have been told why.',
      icon: 'i-lucide-message-circle',
      color: 'success',
    })
    answering.value = null
    reason.value = ''
    await refresh()
  }
  catch (caught) {
    failure.value = refusalText(caught)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-hand"
      title="What people are asking to be taught"
      description="A request is a demand signal, never a queue position. Nothing here resolves on a timer: an ask nobody acts on keeps showing up, which is the point of it."
    />

    <!-- A failed read and an empty one look the same, and "nobody is asking for anything" is an
      answer a lead would act on. So a failure says so rather than rendering as quiet. -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      data-test="load-failed"
      title="The board could not be read"
      description="This is not the same as nothing being asked for. Reload, and if it keeps happening say so."
    />

    <div
      v-else-if="status === 'pending'"
      class="flex items-center gap-3 text-muted"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="animate-spin"
      />
      Reading the board
    </div>

    <p
      v-else-if="data.items.length === 0"
      class="text-sm text-muted"
      data-test="board-empty"
    >
      Nothing outstanding. When somebody asks for one of your department's modules it appears here.
    </p>

    <div
      v-else
      class="space-y-4"
      data-test="demand-board"
    >
      <section
        v-for="demand in data.items"
        :key="demand.moduleId"
        class="rounded-lg border border-default p-4"
        :data-test="`demand-${demand.moduleId}`"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm text-muted">{{ demand.moduleId }}</span>
            <span class="font-medium">{{ demand.moduleName }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ demand.department }}
            </UBadge>
          </div>
          <UBadge
            color="warning"
            variant="subtle"
            :data-test="`waiting-${demand.moduleId}`"
          >
            {{ plural(demand.waiting, 'waiting', 'waiting') }}
          </UBadge>
        </div>

        <ul class="mt-3 space-y-2">
          <li
            v-for="person in demand.requesters"
            :key="person.id"
            class="flex flex-wrap items-start justify-between gap-3 text-sm"
          >
            <div>
              <span class="font-medium">{{ person.name }}</span>
              <p
                v-if="person.note"
                class="text-muted"
              >
                {{ person.note }}
              </p>
            </div>
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :data-test="`answer-${demand.moduleId}`"
              @click="answering = { id: person.id, name: person.name, moduleId: demand.moduleId }"
            >
              Answer
            </UButton>
          </li>
        </ul>
      </section>

      <p class="text-sm text-muted">
        The busiest modules are shown first. Answer or schedule some of these to see the rest.
      </p>
    </div>

    <UModal
      :open="answering !== null"
      title="Answer this request"
      @update:open="value => { if (!value) answering = null }"
    >
      <template #body>
        <p
          v-if="answering"
          class="text-sm text-muted"
        >
          {{ answering.name }} asked for {{ answering.moduleId }}. They are shown what you write, so
          tell them where it stands rather than only that it is declined.
        </p>

        <UFormField
          class="mt-4"
          label="What to tell them"
          required
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            :maxlength="DECLINE_REASON_LIMIT"
            placeholder="Not running this term, but it is on the list for next"
            class="w-full"
            data-test="answer-reason"
          />
        </UFormField>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            :loading="saving"
            :disabled="reason.trim().length < 3"
            data-test="answer-submit"
            @click="answer"
          >
            Send reply
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            @click="answering = null"
          >
            Back
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
