<script setup lang="ts">
import { saysTrainingAction } from '#shared/utils/training-action'
import { saysDay } from '#shared/utils/when'
import type { TrainingAction } from '#shared/utils/training-action'

// The one action a module offers a member, the same wherever it is shown (issue 1335, G-102 c6):
// sign up or join the waiting list in place, say where they stand, or ask when nothing is open.

const props = defineProps<{
  moduleId: string
  moduleName: string
  action: TrainingAction
  // A 48px target where a phone is the likely reader (docs/design-language.md).
  large?: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const working = ref(false)

const when = computed(() => ('session' in props.action
  ? `${saysDay(props.action.session.heldOn)} at ${props.action.session.startsAt}${props.action.session.place ? ` · ${props.action.session.place}` : ''}`
  : null))

async function signUp(): Promise<void> {
  if (!('session' in props.action)) return
  working.value = true
  try {
    await $fetch(`/api/training/sessions/${props.action.session.id}/signup`, { method: 'POST' })
    toast.add({
      title: props.action.kind === 'JOIN_WAITING_LIST' ? 'On the waiting list' : 'Signed up',
      description: `${props.moduleName}, ${when.value}.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('changed')
  }
  catch (error) {
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-2"
    :data-test="`module-action-${moduleId}`"
  >
    <UButton
      v-if="action.kind === 'SIGN_UP' || action.kind === 'JOIN_WAITING_LIST'"
      :size="large ? 'lg' : 'sm'"
      :class="large ? 'min-h-12' : undefined"
      :loading="working"
      :data-test="`module-sign-up-${moduleId}`"
      @click.stop.prevent="signUp"
    >
      {{ saysTrainingAction(action) }}
    </UButton>
    <UBadge
      v-else-if="action.kind === 'PLACED' || action.kind === 'WAITING'"
      :color="action.kind === 'PLACED' ? 'success' : 'warning'"
      variant="subtle"
    >
      {{ saysTrainingAction(action) }}
    </UBadge>
    <!-- Shown, not hidden: the committee's own training stays visible, with why it is not offered (0115). -->
    <UButton
      v-else-if="action.kind === 'COMMITTEE_ONLY'"
      color="neutral"
      variant="subtle"
      :size="large ? 'lg' : 'sm'"
      :class="large ? 'min-h-12' : undefined"
      disabled
      :data-test="`module-committee-only-${moduleId}`"
    >
      {{ saysTrainingAction(action) }}
    </UButton>
    <TrainingRequestModule
      v-else
      :module-id="moduleId"
      :module-name="moduleName"
      :requested="action.kind === 'ASKED'"
      :large="large"
      @requested="emit('changed')"
    />
    <span
      v-if="when"
      class="text-sm text-muted"
    >{{ when }}</span>
  </div>
</template>
