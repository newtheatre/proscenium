<script setup lang="ts">
// Direct edges only, so this is a list and an add rather than a tree (G-108 criterion 1). A brief
// never appears as a candidate, because a brief gates nothing.

interface Prerequisite { id: string, requiresId: string, requiresName: string }
interface Candidate { id: string, name: string, kind: string }

const props = defineProps<{
  moduleId: string
  prerequisites: Prerequisite[]
  candidates: Candidate[]
}>()

const emit = defineEmits<{ changed: [], failed: [message: string] }>()

const adding = ref<string | null>(null)
const working = ref(false)

// A module cannot require itself, and a brief can never be required (criteria 3 and 4).
const offered = computed(() => props.candidates.filter(candidate =>
  candidate.id !== props.moduleId
  && candidate.kind !== 'BRIEF'
  && !props.prerequisites.some(need => need.requiresId === candidate.id)))

async function add(requiresId: string): Promise<void> {
  working.value = true
  try {
    await $fetch(`/api/admin/training/modules/${props.moduleId}/prerequisites`, {
      method: 'POST',
      body: { requiresId },
    })
    adding.value = null
    emit('changed')
  }
  catch (error) {
    emit('failed', refusalText(error))
  }
  finally {
    working.value = false
  }
}

async function remove(id: string): Promise<void> {
  working.value = true
  try {
    await $fetch(`/api/admin/training/prerequisites/${id}`, { method: 'DELETE' })
    emit('changed')
  }
  catch (error) {
    emit('failed', refusalText(error))
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="prerequisites.length === 0"
      class="text-sm text-muted"
      data-test="no-prerequisites"
    >
      Nothing is needed before this one.
    </p>

    <div
      v-else
      class="flex flex-wrap gap-2"
    >
      <UBadge
        v-for="need in prerequisites"
        :key="need.id"
        color="neutral"
        variant="subtle"
      >
        {{ need.requiresId }} {{ need.requiresName }}
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="working"
          :aria-label="`Stop requiring ${need.requiresName}`"
          :data-test="`drop-prerequisite-${need.requiresId}`"
          @click="remove(need.id)"
        />
      </UBadge>
    </div>

    <!-- A row of buttons rather than a select: a Nuxt UI select is a listbox, so setting a value
         on one does nothing, and a closed set this size reads better as buttons anyway. -->
    <div
      v-if="offered.length"
      class="flex flex-wrap gap-1"
    >
      <UButton
        v-for="candidate in offered"
        :key="candidate.id"
        size="xs"
        color="neutral"
        variant="outline"
        :disabled="working"
        :data-test="`add-prerequisite-${candidate.id}`"
        @click="add(candidate.id)"
      >
        Needs {{ candidate.id }}
      </UButton>
    </div>
  </div>
</template>
