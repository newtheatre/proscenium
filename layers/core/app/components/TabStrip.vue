<!-- A row of tabs that scrolls sideways when it does not fit: a fade at an edge says there are more
     that way, and the open tab is brought into view. Wrap a UTabs whose list scrolls. -->
<script setup lang="ts">
defineSlots<{ default?: () => unknown }>()
const strip = useTemplateRef<HTMLElement>('strip')
const scroll = reactive({ left: true, right: true })
let list: HTMLElement | null = null
function measure() {
  if (!list) return
  scroll.left = list.scrollLeft <= 1
  scroll.right = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1
}
function attach() {
  const next = strip.value?.querySelector<HTMLElement>('[role="tablist"]') ?? null
  if (next === list) return measure()
  list?.removeEventListener('scroll', measure)
  list = next
  list?.addEventListener('scroll', measure, { passive: true })
  const open = list?.querySelector<HTMLElement>('[data-state="active"]')
  // Only sideways: scrollIntoView would also move the page.
  if (list && open) list.scrollLeft = open.offsetLeft - (list.clientWidth - open.clientWidth) / 2
  measure()
}
onMounted(() => {
  attach()
  window.addEventListener('resize', measure)
})
onUpdated(attach)
onBeforeUnmount(() => {
  list?.removeEventListener('scroll', measure)
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div
    ref="strip"
    class="relative"
  >
    <span
      v-show="!scroll.left"
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 start-0 z-10 w-8 bg-gradient-to-r from-default to-transparent"
    />
    <span
      v-show="!scroll.right"
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 end-0 z-10 w-8 bg-gradient-to-l from-default to-transparent"
    />
    <slot />
  </div>
</template>
