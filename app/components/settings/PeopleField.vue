<script setup lang="ts">
// A list of people is chosen with the person picker and read as names, never typed as ids
// (J-104 criterion 2, 0032). The names come from the settings list, to config.read alone.

const model = defineModel<string[]>({ default: () => [] })
const props = defineProps<{ name: string, label: string, people: { id: string, name: string | null }[] }>()

const names = reactive(new Map<string, string>())
watch(() => props.people, (people) => {
  for (const person of people) {
    if (person.name) names.set(person.id, person.name)
  }
}, { immediate: true })

// The picker only finds somebody; the list is this component's, so the picker clears after each.
const picked = ref<string | undefined>()

function add(person: { id: string, name: string } | null): void {
  if (!person) return
  names.set(person.id, person.name)
  if (!model.value.includes(person.id)) model.value = [...model.value, person.id]
  nextTick(() => {
    picked.value = undefined
  })
}

function remove(id: string): void {
  model.value = model.value.filter(held => held !== id)
}
</script>

<template>
  <div
    class="min-w-64 flex-1 space-y-2"
    :data-test="`input-${props.name}`"
  >
    <ul
      v-if="model.length"
      class="flex flex-wrap gap-1.5"
      :aria-label="props.label"
    >
      <li
        v-for="id in model"
        :key="id"
      >
        <UBadge
          color="neutral"
          variant="subtle"
          :data-test="`person-${id}`"
        >
          {{ names.get(id) ?? 'An account that no longer exists' }}
          <UButton
            color="neutral"
            variant="link"
            size="xs"
            icon="i-lucide-x"
            class="p-0"
            :aria-label="`Remove ${names.get(id) ?? 'this account'}`"
            @click="remove(id)"
          />
        </UBadge>
      </li>
    </ul>
    <p
      v-else
      class="text-sm text-muted"
    >
      Nobody is named.
    </p>

    <PersonPicker
      v-model="picked"
      placeholder="Add somebody"
      @chosen="add"
    />
  </div>
</template>
