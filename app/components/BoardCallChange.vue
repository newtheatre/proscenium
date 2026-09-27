<script setup lang="ts">
import { correctableMilestone, nextCall } from '#shared/utils/backstage'
import type { BoardSide } from '#shared/utils/backstage'

// One end's own milestone calls, as either end draws them (issue 1313): the next in the
// committee's order, and a change to its own latest while nobody has called another since.
const props = defineProps<{
  side: BoardSide
  milestoneTypes: { id: string, label: string, sort: number }[]
  messages: { id: string, side: BoardSide, milestoneTypeId: string | null, milestoneLabel: string | null, supersedesId: string | null, composedAt: number }[]
  supersedeUrl: (id: string) => string
  color: 'primary' | 'secondary'
}>()
const emit = defineEmits<{ send: [milestoneTypeId: string], changed: [] }>()

const next = computed(() => nextCall(props.milestoneTypes, props.messages))
const changeable = computed(() => correctableMilestone(props.side, props.messages))
const changing = ref(false)
const changeFailure = ref<string | null>(null)

async function changeTo(milestoneTypeId: string): Promise<void> {
  const wrong = changeable.value
  if (!wrong) return
  changeFailure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(props.supersedeUrl(wrong.id), {
      method: 'POST',
      body: { milestoneTypeId, composedAt: Math.floor(Date.now() / 1000) },
    })
    changing.value = false
    emit('changed')
  }
  catch (error) {
    changeFailure.value = refusalText(error)
  }
}
</script>

<template>
  <UButton
    v-if="changeable"
    color="neutral"
    variant="link"
    class="min-h-12"
    data-test="board-change-call"
    @click="changing = true"
  >
    Change the call
  </UButton>

  <UButton
    v-if="next"
    :color="color"
    size="xl"
    block
    icon="i-lucide-arrow-right"
    class="min-h-14"
    data-test="board-next-call"
    @click="emit('send', next.id)"
  >
    Next call: {{ next.label }}
  </UButton>

  <!-- A tap on the right call is the change itself, so the sheet has no primary of its own. -->
  <NightSheet
    v-model:open="changing"
    :title="changeable ? `Sent as ${changeable.milestoneLabel}: change it to` : 'Change the call'"
  >
    <div
      class="space-y-3"
      data-test="board-change-form"
    >
      <UAlert
        v-if="changeFailure"
        color="error"
        variant="subtle"
        :description="changeFailure"
        data-test="board-change-failure"
      />
      <div class="grid grid-cols-2 gap-2">
        <UButton
          v-for="(type, index) in milestoneTypes.filter(one => one.id !== changeable?.milestoneTypeId)"
          :key="type.id"
          color="neutral"
          variant="outline"
          size="lg"
          class="min-h-12"
          :data-sheet-first="index === 0 ? '' : undefined"
          :data-test="`board-change-to-${type.id}`"
          @click="changeTo(type.id)"
        >
          {{ type.label }}
        </UButton>
      </div>
    </div>
  </NightSheet>
</template>
