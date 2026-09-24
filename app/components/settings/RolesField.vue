<script setup lang="ts">
import { ROLES, saysRole } from '#shared/utils/roles'

// Roles are chosen from the roles that exist, by title, so a misspelt one cannot be saved.

const model = defineModel<string[]>({ default: () => [] })
const props = defineProps<{ name: string, label: string }>()

const items = ROLES.map(role => ({ label: saysRole(role), value: role }))
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
