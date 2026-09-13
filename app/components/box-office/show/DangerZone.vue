<script setup lang="ts">
import type { AdminShow } from '#shared/utils/programme'

// The two actions that take a show away from the public (D-132 criterion 8). Both are the page's
// own, so this card states what each one does and hands the decision back.

defineProps<{ show: AdminShow, busy: boolean }>()
const emit = defineEmits<{ unpublish: [], remove: [] }>()
</script>

<template>
  <UCard data-test="danger-zone">
    <template #header>
      <h3 class="font-semibold">
        Danger zone
      </h3>
    </template>

    <div class="space-y-4">
      <div
        v-if="show.status === 'PUBLISHED'"
        class="space-y-2"
      >
        <UButton
          color="error"
          variant="soft"
          block
          :disabled="busy"
          data-test="unpublish"
          @click="emit('unpublish')"
        >
          Take off sale
        </UButton>
        <p class="text-sm text-muted">
          Existing reservations are kept and nothing sold is touched. The public page goes away.
        </p>
      </div>
      <p
        v-else
        class="text-sm text-muted"
      >
        This show is a draft, so there is nothing on sale to take away.
      </p>

      <div
        v-if="show.soldTickets === 0"
        class="space-y-2 border-t border-default pt-4"
      >
        <UButton
          color="error"
          variant="ghost"
          block
          :disabled="busy"
          data-test="delete-show"
          @click="emit('remove')"
        >
          Delete this show
        </UButton>
        <p class="text-sm text-muted">
          Nothing has ever been sold under it, so there is no history to lose.
        </p>
      </div>
    </div>
  </UCard>
</template>
