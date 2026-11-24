<!-- The till receipt's lines, grouped by panel, each with its stepper while the sale can still change,
     and any note a panel keeps on its part, such as the answer to an age check. -->
<script setup lang="ts">
import type { ReceiptGroup } from '../../shared/till'

defineProps<{
  groups: ReceiptGroup[]
  /** A payment is being taken: quantities show as text and nothing can be changed. */
  locked: boolean
  money: (minor: number) => string
}>()
const { t } = useT()
</script>

<template>
  <div class="divide-y divide-default">
    <section
      v-for="g in groups"
      :key="g.id"
      class="py-3 first:pt-0"
    >
      <h3 class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
        <UIcon
          v-if="g.icon"
          :name="g.icon"
          class="size-4"
        />{{ g.label }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="line in g.lines"
          :key="line.key"
          class="flex items-center gap-3 text-base"
        >
          <div class="min-w-0 flex-1">
            <p>{{ line.label }}</p>
            <p
              v-if="line.detail"
              class="text-sm text-muted"
            >
              {{ line.detail }}
            </p>
          </div>
          <span
            v-if="locked && line.quantity > 1"
            class="text-sm text-muted tabular-nums"
          >× {{ line.quantity }}</span>
          <div
            v-else-if="!locked && line.more && line.fewer"
            class="flex items-center rounded-lg border border-default"
          >
            <IconButton
              :icon="line.quantity === 1 ? 'i-lucide-trash-2' : 'i-lucide-minus'"
              :label="t(line.quantity === 1 ? 'payments.screens.till.remove' : 'payments.screens.till.fewer', { name: line.label })"
              @click="line.fewer()"
            />
            <span class="w-7 text-center font-semibold tabular-nums">{{ line.quantity }}</span>
            <IconButton
              icon="i-lucide-plus"
              :label="t('payments.screens.till.more', { name: line.label })"
              @click="line.more()"
            />
          </div>
          <span class="w-16 text-end tabular-nums">{{ money(line.amountMinor) }}</span>
        </li>
      </ul>
      <div
        v-if="g.note"
        class="mt-3 flex items-center gap-2 rounded-lg bg-elevated px-3 py-1.5 text-sm"
      >
        <UIcon
          v-if="g.note.icon"
          :name="g.note.icon"
          class="size-4 shrink-0 text-success"
        />
        <span class="flex-1">{{ g.note.text }}</span>
        <UButton
          v-if="g.note.action && !locked"
          size="sm"
          color="neutral"
          variant="link"
          :label="g.note.action.label"
          @click="g.note.action.run()"
        />
      </div>
    </section>
  </div>
</template>
