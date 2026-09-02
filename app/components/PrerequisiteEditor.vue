<script setup lang="ts">
// Direct edges only, so this is a set rather than a tree (G-108 criterion 1). A brief never appears
// as a candidate, because a brief gates nothing.

interface Prerequisite { id: string, requiresId: string, requiresName: string }
interface Candidate { id: string, name: string, kind: string }

const props = defineProps<{
  moduleId: string
  prerequisites: Prerequisite[]
  candidates: Candidate[]
}>()

const emit = defineEmits<{ changed: [], failed: [message: string] }>()

const working = ref(false)

// A module cannot require itself, and a brief can never be required (criteria 3 and 4). What is
// already required stays on the list, because a multi-select needs its own value among the options.
const options = computed(() => props.candidates
  .filter(candidate => candidate.id !== props.moduleId && candidate.kind !== 'BRIEF')
  .map(candidate => ({ label: `${candidate.id} ${candidate.name}`, value: candidate.id })))

const held = computed(() => props.prerequisites.map(need => need.requiresId))
const chosen = ref<string[]>([])
watch(held, value => chosen.value = [...value], { immediate: true })

// Each edge is its own row on the server, so a changed set becomes the adds and the drops between
// what was there and what was picked. A refusal, a loop most likely, puts the control back.
async function apply(next: string[]): Promise<void> {
  const added = next.filter(id => !held.value.includes(id))
  const dropped = props.prerequisites.filter(need => !next.includes(need.requiresId))

  working.value = true
  try {
    for (const requiresId of added) {
      await $fetch(`/api/admin/training/modules/${props.moduleId}/prerequisites`, {
        method: 'POST',
        body: { requiresId },
      })
    }
    for (const need of dropped) {
      await $fetch(`/api/admin/training/prerequisites/${need.id}`, { method: 'DELETE' })
    }
    emit('changed')
  }
  catch (error) {
    emit('failed', refusalText(error))
    chosen.value = [...held.value]
  }
  finally {
    working.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <USelectMenu
      :model-value="chosen"
      :items="options"
      value-key="value"
      multiple
      :disabled="working || options.length === 0"
      placeholder="Search the catalogue"
      class="w-full"
      data-test="module-prerequisites"
      @update:model-value="apply"
    />

    <p
      v-if="prerequisites.length === 0"
      class="text-sm text-muted"
      data-test="no-prerequisites"
    >
      Nothing is needed before this one.
    </p>
    <p
      v-else
      class="text-sm text-muted"
      data-test="prerequisite-summary"
    >
      Needs {{ prerequisites.map(need => `${need.requiresId} ${need.requiresName}`).join(', ') }} first.
    </p>
  </div>
</template>
