<script setup lang="ts">
import { publishChecklist, saysPublishCheck } from '#shared/utils/programme'
import type { AdminShow } from '#shared/utils/programme'

// What a show still wants before it is ready for the public site (D-132 criterion 7). It reports
// and gates nothing: an outstanding check never stops the publish button (D-121).

const props = defineProps<{ show: AdminShow }>()

const checks = computed(() => publishChecklist(props.show))
const outstanding = computed(() => checks.value.filter(check => !check.done).length)
</script>

<template>
  <UCard data-test="publish-checklist">
    <template #header>
      <h3 class="font-semibold">
        Publish checklist
      </h3>
    </template>

    <ul class="space-y-3">
      <li
        v-for="check in checks"
        :key="check.key"
        class="flex items-start gap-2 text-sm"
        :data-test="`check-${check.key}`"
      >
        <UIcon
          :name="check.done ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
          :class="check.done ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-warning'"
          aria-hidden="true"
        />
        <span :class="check.done ? 'text-toned' : 'font-medium text-warning'">
          {{ saysPublishCheck(check) }}
        </span>
      </li>
    </ul>

    <template #footer>
      <p class="text-sm text-muted">
        {{ outstanding === 0
          ? 'Nothing outstanding. Publishing is still yours to do.'
          : `${plural(outstanding, 'thing', 'things')} outstanding. Nothing here stops you publishing.` }}
      </p>
    </template>
  </UCard>
</template>
