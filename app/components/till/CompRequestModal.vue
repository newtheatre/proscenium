<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { COMP_REASON_LIMIT } from '#shared/utils/comps'
import type { CompRequest } from '#shared/utils/comps'

// Ask, wait and give a comp without leaving the sale (F-110): the same basket the till already
// priced, a reason on the record, then a poll of the single request while it waits on a decision.

defineProps<{
  totalPence: number
  sending: boolean
  sendFailure: string | null
  requestId: string | null
  request: CompRequest | null
  canGive: boolean
  declined: boolean
  lapsed: boolean
  pollFailure: string | null
  givingBusy: boolean
  giveFailure: string | null
  given: boolean
}>()
const emit = defineEmits<{ send: [], give: [], done: [], dismiss: [] }>()

const open = defineModel<boolean>('open', { required: true })
const reason = defineModel<string>('reason', { required: true })
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ask for a comp"
    description="Free, once a duty manager or the bar manager agrees."
  >
    <template #body>
      <div class="space-y-4">
        <p
          data-test="comp-request-total"
          class="text-sm text-muted"
        >
          Giving away {{ saysMoney(totalPence) }}.
        </p>

        <template v-if="!requestId">
          <UFormField label="Why">
            <UTextarea
              v-model="reason"
              :maxlength="COMP_REASON_LIMIT"
              placeholder="Say why, because a comp needs a reason on the record"
              data-test="comp-reason"
            />
          </UFormField>
          <UAlert
            v-if="sendFailure"
            data-test="comp-send-failure"
            color="error"
            variant="subtle"
            :description="sendFailure"
          />
          <UButton
            block
            class="min-h-12"
            :loading="sending"
            :disabled="!reason.trim()"
            data-test="comp-send"
            @click="emit('send')"
          >
            Ask
          </UButton>
        </template>

        <template v-else-if="given">
          <UAlert
            data-test="comp-given-confirmation"
            color="success"
            variant="subtle"
            icon="i-lucide-check"
            title="Comp given"
            description="Nothing to take on the reader."
          />
          <UButton
            block
            class="min-h-12"
            data-test="comp-next-sale"
            @click="emit('done')"
          >
            Start the next sale
          </UButton>
        </template>

        <template v-else-if="declined">
          <UAlert
            data-test="comp-declined"
            color="error"
            variant="subtle"
            :description="request?.declineReason ? `Declined: ${request.declineReason}` : 'Declined.'"
          />
          <UButton
            block
            class="min-h-12"
            data-test="comp-dismiss"
            @click="emit('dismiss')"
          >
            OK
          </UButton>
        </template>

        <template v-else-if="lapsed">
          <UAlert
            data-test="comp-lapsed"
            color="warning"
            variant="subtle"
            description="That request has lapsed; ask again."
          />
          <UButton
            block
            class="min-h-12"
            data-test="comp-dismiss"
            @click="emit('dismiss')"
          >
            OK
          </UButton>
        </template>

        <template v-else-if="canGive">
          <UAlert
            data-test="comp-approved"
            color="success"
            variant="subtle"
            description="Approved. Give it to close the sale."
          />
          <UAlert
            v-if="giveFailure"
            data-test="comp-give-failure"
            color="error"
            variant="subtle"
            :description="giveFailure"
          />
          <UButton
            block
            class="min-h-12"
            :loading="givingBusy"
            data-test="comp-give"
            @click="emit('give')"
          >
            Give the comp
          </UButton>
          <UButton
            block
            color="neutral"
            variant="subtle"
            class="min-h-12"
            data-test="comp-keep-waiting"
            @click="open = false"
          >
            Close, keep waiting
          </UButton>
        </template>

        <template v-else>
          <div
            data-test="comp-waiting"
            class="space-y-2 py-4 text-center text-sm text-muted"
          >
            <p>Waiting on a duty manager or the bar manager&hellip;</p>
            <UAlert
              v-if="pollFailure"
              data-test="comp-poll-failure"
              color="warning"
              variant="subtle"
              :description="pollFailure"
            />
            <UButton
              block
              color="neutral"
              variant="subtle"
              class="min-h-12"
              data-test="comp-keep-waiting"
              @click="open = false"
            >
              Close, keep waiting
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
