<script setup lang="ts">
import { describeExpiry, saysDeliveryMode, saysKind } from '#shared/utils/training'
import { saysDay } from '#shared/utils/when'
import type { DeliveryMode, ExpiryMode, ModuleKind } from '#shared/utils/training'
import type { TrainingAction } from '#shared/utils/training-action'

// One catalogue card, calm (no marquee, sticker or spotlight): the public catalogue spends its
// whole budget on the hero and nowhere else (G-128, K-101).

interface Prerequisite { moduleId: string, name: string, held: boolean | null }
interface NextSession { id: string, heldOn: string, startsAt: string, place: string | null }

const props = defineProps<{
  id: string
  kind: ModuleKind
  name: string
  description: string | null
  deliveryMode: DeliveryMode
  expiryMode: ExpiryMode
  expiryMonths: number | null
  safetyCritical: boolean
  held: boolean | null
  prerequisites: Prerequisite[]
  nextSession: NextSession | null
  signedIn: boolean
  requested: boolean | null
  // Null when signed out, or for a module the member already holds (issue 1335).
  action: TrainingAction | null
}>()

const emit = defineEmits<{ changed: [] }>()

const nextSessionLine = computed(() => {
  if (!props.nextSession) return 'No session scheduled'
  const day = saysDay(props.nextSession.heldOn)
  return props.nextSession.place ? `${day}, ${props.nextSession.startsAt} · ${props.nextSession.place}` : `${day}, ${props.nextSession.startsAt}`
})
</script>

<template>
  <UPageCard
    :to="`/training/modules/${id}`"
    variant="outline"
    :data-test="`catalogue-module-${id}`"
  >
    <template #header>
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-xs text-muted">{{ id }}</span>
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          {{ saysKind(kind) }}
        </UBadge>
        <UBadge
          v-if="safetyCritical"
          color="warning"
          variant="subtle"
          size="sm"
        >
          Safety critical
        </UBadge>
        <UBadge
          v-if="held"
          color="success"
          variant="subtle"
          size="sm"
        >
          You hold this
        </UBadge>
      </div>
    </template>

    <template #title>
      {{ name }}
    </template>

    <template #description>
      <span
        v-if="description"
        class="line-clamp-3"
      >
        {{ description }}
      </span>
    </template>

    <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1">
      <div>
        <dt class="text-xs text-muted">
          Worth
        </dt>
        <dd>{{ describeExpiry({ expiryMode, expiryMonths }) }}</dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Taught
        </dt>
        <dd>{{ saysDeliveryMode(deliveryMode) }}</dd>
      </div>
      <div v-if="prerequisites.length">
        <dt class="text-xs text-muted">
          Needs
        </dt>
        <dd class="flex flex-wrap gap-1">
          <span
            v-for="need in prerequisites"
            :key="need.moduleId"
          >
            {{ need.name }}<span v-if="need.held">&nbsp;✓</span>
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-muted">
          Next session
        </dt>
        <dd>{{ nextSessionLine }}</dd>
      </div>
    </dl>

    <template
      v-if="(signedIn && action) || !signedIn"
      #footer
    >
      <TrainingModuleAction
        v-if="signedIn && action"
        :module-id="id"
        :module-name="name"
        :action="action"
        @changed="emit('changed')"
      />
      <ULink
        v-else-if="!signedIn"
        to="/sign-in"
        class="text-sm"
      >
        Sign in to take it
      </ULink>
    </template>
  </UPageCard>
</template>
