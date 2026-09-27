<script setup lang="ts">
import { ROLES, saysRole } from '#shared/utils/roles'

// Roles are chosen from the roles that exist, by title, so a misspelt one cannot be saved. A fixed
// role once ticked cannot be unticked, and one stored off the list can be ticked back to repair it.

const model = defineModel<string[]>({ default: () => [] })
const props = withDefaults(defineProps<{ name: string, label: string, fixed?: readonly string[] }>(), { fixed: () => [] })

const items = computed<{ label: string, value: string, disabled: boolean }[]>(() =>
  ROLES.map(role => ({ label: saysRole(role), value: role, disabled: props.fixed.includes(role) && model.value.includes(role) })))
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    multiple
    placeholder="Choose roles"
    :aria-label="props.label"
    :data-test="`input-${props.name}`"
    class="min-w-64 flex-1"
  />
</template>
