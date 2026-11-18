<!-- A content block that shows only while a condition holds, so a page never says something the
     system no longer does:

       ::when{setting="box-office.cancellations.by-buyer" is="true"}
       You can cancel online.

       #otherwise
       Contact the box office.
       ::

     It tests one of: a setting (`is`, `not` or `above`), whether a setting has a value (`has`),
     whether a module is on (`module`), or a fact (`fact`, with `is`, `not` or `above`). The same
     test decides what a policy's recorded version says (shared/policies.ts). -->
<script setup lang="ts">
import { holds } from '../../../shared/policies'

const props = defineProps<{ setting?: string, fact?: string, has?: string, module?: string, is?: string, not?: string, above?: string }>()
const { data: settings } = await usePublicSettings()
const { data: context } = await usePolicyContext()
const shown = computed(() => holds(props, {
  settings: settings.value ?? {},
  facts: context.value?.facts ?? {},
  tables: {},
  modules: context.value?.modules ?? [],
  country: context.value?.country ?? '',
}))
</script>

<template>
  <slot v-if="shown" />
  <slot
    v-else
    name="otherwise"
  />
</template>
