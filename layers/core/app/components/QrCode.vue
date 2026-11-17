<!-- A code drawn as a QR code, for a person to hold up to a camera at the desk or the door. Drawn on the
     device as an SVG: one unit square per dark module, a quiet border of four, always black on white
     so any camera reads it in either colour theme. -->
<script setup lang="ts">
import { encode } from 'uqr'

const props = defineProps<{
  value: string
  /** What the code is, for screen readers: "Your desk code". */
  label: string
}>()

const qr = computed(() => {
  const { size, data } = encode(props.value, { border: 4, ecc: 'M' })
  return { size, path: data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : '')).join('') }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    class="aspect-square w-56 max-w-full rounded-md bg-white"
    shape-rendering="crispEdges"
    role="img"
    :aria-label="label"
  >
    <path
      :d="qr.path"
      fill="black"
    />
  </svg>
</template>
