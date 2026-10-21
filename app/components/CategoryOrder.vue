<script setup lang="ts">
import type { BarCategory } from '#shared/utils/bar'

// The till's category order, set by dragging a row or by its arrows (0143). Each drop is one
// move, saved at once; the arrows are the same move for a keyboard, or a hand on a phone.
const props = defineProps<{ categories: BarCategory[] }>()
const emit = defineEmits<{ moved: [] }>()

const toast = useToast()
const order = ref<BarCategory[]>([])
watch(() => props.categories, (categories) => {
  order.value = [...categories]
}, { immediate: true })

const dragging = ref<string | null>(null)
const over = ref<number | null>(null)
const saving = ref(false)
const failure = ref<string | null>(null)

async function move(id: string, position: number): Promise<void> {
  const from = order.value.findIndex(category => category.id === id)
  if (from < 0 || position < 0 || position >= order.value.length || from === position) return
  const before = [...order.value]
  const [moving] = order.value.splice(from, 1)
  order.value.splice(position, 0, moving!)
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/bar/categories/${id}/move`, { method: 'POST', body: { position } })
    toast.add({ title: `${moving!.name} moved`, description: 'The till draws its next screen in this order.', icon: 'i-lucide-check', color: 'success' })
    emit('moved')
  }
  catch (refused) {
    order.value = before
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

function dropAt(position: number): void {
  const id = dragging.value
  dragging.value = null
  over.value = null
  if (id) void move(id, position)
}
</script>

<template>
  <UCard data-test="category-order">
    <template #header>
      <h3 class="font-semibold">
        Order on the till
      </h3>
      <p class="text-sm text-muted">
        Drag a category up or down, or use its arrows. The till shows them in this order.
      </p>
    </template>

    <UAlert
      v-if="failure"
      class="mb-3"
      color="error"
      variant="subtle"
      :description="failure"
      data-test="category-order-failure"
    />

    <p
      v-if="order.length === 0"
      class="text-sm text-muted"
    >
      No categories yet.
    </p>

    <ol
      v-else
      class="divide-y divide-default rounded-md border border-default"
    >
      <li
        v-for="(category, index) in order"
        :key="category.id"
        class="flex items-center gap-3 p-2"
        :class="{ 'bg-elevated': over === index, 'opacity-50': dragging === category.id }"
        draggable="true"
        :data-test="`category-order-${category.id}`"
        @dragstart="dragging = category.id"
        @dragend="dragging = null; over = null"
        @dragover.prevent="over = index"
        @drop.prevent="dropAt(index)"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="size-5 shrink-0 cursor-grab text-muted"
          aria-hidden="true"
        />
        <span class="w-6 shrink-0 text-right text-sm text-muted">{{ index + 1 }}</span>
        <span
          v-if="category.colour"
          class="size-3 shrink-0 rounded-full border border-default"
          :style="{ backgroundColor: category.colour }"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ category.name }}</span>
        <UButton
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Move ${category.name} up`"
          :disabled="index === 0 || saving"
          :data-test="`category-up-${category.id}`"
          @click="move(category.id, index - 1)"
        />
        <UButton
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Move ${category.name} down`"
          :disabled="index === order.length - 1 || saving"
          :data-test="`category-down-${category.id}`"
          @click="move(category.id, index + 1)"
        />
      </li>
    </ol>
  </UCard>
</template>
